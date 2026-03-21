package controller

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/shopspring/decimal"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/native"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

type WeChatPayRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
}

type WeChatPayConfig struct {
	MchID      string `json:"mch_id"`
	AppID      string `json:"app_id"`
	APIv3Key   string `json:"api_v3_key"`
	PrivateKey string `json:"private_key"`
	CertSerial string `json:"cert_serial"`
	Enabled    bool   `json:"enabled"`
}

var wechatPayConfig = WeChatPayConfig{
	MchID:      setting.WeChatPayMchID,
	AppID:      setting.WeChatPayAppID,
	APIv3Key:   setting.WeChatPayAPIv3Key,
	PrivateKey: setting.WeChatPayPrivateKey,
	CertSerial: setting.WeChatPayCertSerial,
	Enabled:    setting.WeChatPayEnabled,
}

func GetWeChatPayClient() (*core.Client, error) {
	if !wechatPayConfig.Enabled || wechatPayConfig.MchID == "" || wechatPayConfig.AppID == "" || wechatPayConfig.APIv3Key == "" || wechatPayConfig.PrivateKey == "" {
		return nil, fmt.Errorf("微信支付配置不完整")
	}

	mchPrivateKey, err := utils.LoadPrivateKey(wechatPayConfig.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("加载商户私钥失败: %v", err)
	}

	ctx := context.Background()
	opts := []core.ClientOption{
		option.WithWechatPayAutoAuthCipher(wechatPayConfig.MchID, wechatPayConfig.CertSerial, mchPrivateKey, wechatPayConfig.APIv3Key),
	}

	client, err := core.NewClient(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("创建微信支付客户端失败: %v", err)
	}

	return client, nil
}

func RequestWeChatPay(c *gin.Context) {
	var req WeChatPayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	if req.Amount < getMinTopup() {
		c.JSON(200, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getMinTopup())})
		return
	}

	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}

	payMoney := getPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		c.JSON(200, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	if !operation_setting.ContainsPayMethod(req.PaymentMethod) {
		c.JSON(200, gin.H{"message": "error", "data": "支付方式不存在"})
		return
	}

	if req.PaymentMethod != "wxpay" {
		c.JSON(200, gin.H{"message": "error", "data": "仅支持微信支付"})
		return
	}

	client, err := GetWeChatPayClient()
	if err != nil {
		logger.Error("创建微信支付客户端失败: " + err.Error())
		c.JSON(200, gin.H{"message": "error", "data": "微信支付配置错误"})
		return
	}

	svc := native.NativeApiService{Client: client}
	ctx := context.Background()

	callBackAddress := service.GetCallbackAddress()
	notifyUrl := callBackAddress + "/api/user/wechatpay/notify"
	tradeNo := fmt.Sprintf("%s%d", common.GetRandomString(6), time.Now().Unix())
	tradeNo = fmt.Sprintf("USR%dNO%s", id, tradeNo)

	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount := decimal.NewFromInt(int64(amount))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		amount = dAmount.Div(dQuotaPerUnit).IntPart()
	}

	payMoneyCents := int64(payMoney * 100)

	reqService := native.PrepayRequest{
		Appid:       core.String(wechatPayConfig.AppID),
		Mchid:       core.String(wechatPayConfig.MchID),
		Description: core.String(fmt.Sprintf("TUC%d", req.Amount)),
		OutTradeNo:  core.String(tradeNo),
		NotifyUrl:   core.String(notifyUrl),
		Amount: &native.Amount{
			Total: core.Int64(payMoneyCents),
		},
	}

	resp, _, err := svc.Prepay(ctx, reqService)
	if err != nil {
		logger.Error("微信支付预下单失败: " + err.Error())
		c.JSON(200, gin.H{"message": "error", "data": "创建支付订单失败"})
		return
	}

	topUp := &model.TopUp{
		UserId:        id,
		Amount:        amount,
		Money:         payMoney,
		TradeNo:       tradeNo,
		PaymentMethod: req.PaymentMethod,
		CreateTime:    time.Now().Unix(),
		Status:        "pending",
	}
	err = topUp.Insert()
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	data := gin.H{
		"code_url": *resp.CodeUrl,
		"trade_no": tradeNo,
	}
	common.ApiSuccess(c, data)
}

func WeChatPayNotify(c *gin.Context) {
	client, err := GetWeChatPayClient()
	if err != nil {
		logger.Error("创建微信支付客户端失败: " + err.Error())
		c.String(500, "FAIL")
		return
	}

	svc := native.NativeApiService{Client: client}
	ctx := context.Background()

	notifyReq := c.Request
	notifyResp, err := svc.ParseOrderNotification(ctx, notifyReq)
	if err != nil {
		logger.Error("解析微信支付通知失败: " + err.Error())
		c.String(500, "FAIL")
		return
	}

	tradeNo := *notifyResp.OutTradeNo
	transactionId := *notifyResp.TransactionId
	totalAmount := float64(*notifyResp.Amount.Total) / 100.0

	topUp, err := model.GetTopUpByTradeNo(tradeNo)
	if err != nil {
		logger.Error("获取订单失败: " + err.Error())
		c.String(500, "FAIL")
		return
	}

	if topUp.Status == "success" {
		c.String(200, "SUCCESS")
		return
	}

	if *notifyResp.TradeState == "SUCCESS" {
		topUp.Status = "success"
		topUp.PayTime = time.Now().Unix()
		topUp.TransactionId = transactionId
		topUp.Money = totalAmount

		err = topUp.Update()
		if err != nil {
			logger.Error("更新订单状态失败: " + err.Error())
			c.String(500, "FAIL")
			return
		}

		user, err := model.GetUserById(topUp.UserId, false)
		if err != nil {
			logger.Error("获取用户信息失败: " + err.Error())
			c.String(500, "FAIL")
			return
		}

		user.Quota += topUp.Amount
		err = user.Update(false)
		if err != nil {
			logger.Error("更新用户配额失败: " + err.Error())
			c.String(500, "FAIL")
			return
		}

		logger.Info(fmt.Sprintf("用户 %d 充值成功，订单号: %s，交易号: %s，金额: %.2f", topUp.UserId, tradeNo, transactionId, totalAmount))
		c.String(200, "SUCCESS")
	} else {
		logger.Warn(fmt.Sprintf("微信支付失败，订单号: %s，状态: %s", tradeNo, *notifyResp.TradeState))
		c.String(200, "SUCCESS")
	}
}

func GetWeChatPayConfig(c *gin.Context) {
	data := gin.H{
		"enabled":     setting.WeChatPayEnabled,
		"mch_id":      setting.WeChatPayMchID,
		"app_id":      setting.WeChatPayAppID,
		"api_v3_key":  setting.WeChatPayAPIv3Key,
		"private_key": setting.WeChatPayPrivateKey,
		"cert_serial": setting.WeChatPayCertSerial,
	}
	common.ApiSuccess(c, data)
}

func UpdateWeChatPayConfig(c *gin.Context) {
	var config WeChatPayConfig
	err := c.ShouldBindJSON(&config)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	// 更新配置
	setting.WeChatPayEnabled = config.Enabled
	setting.WeChatPayMchID = config.MchID
	setting.WeChatPayAppID = config.AppID
	setting.WeChatPayAPIv3Key = config.APIv3Key
	setting.WeChatPayPrivateKey = config.PrivateKey
	setting.WeChatPayCertSerial = config.CertSerial

	// 同步到wechatPayConfig变量
	wechatPayConfig = WeChatPayConfig{
		MchID:      setting.WeChatPayMchID,
		AppID:      setting.WeChatPayAppID,
		APIv3Key:   setting.WeChatPayAPIv3Key,
		PrivateKey: setting.WeChatPayPrivateKey,
		CertSerial: setting.WeChatPayCertSerial,
		Enabled:    setting.WeChatPayEnabled,
	}

	if config.Enabled && config.MchID != "" && config.AppID != "" && config.APIv3Key != "" && config.PrivateKey != "" {
		_, err := GetWeChatPayClient()
		if err != nil {
			c.JSON(200, gin.H{"message": "error", "data": "微信支付配置验证失败: " + err.Error()})
			return
		}
	}

	c.JSON(200, gin.H{"message": "success", "data": "微信支付配置更新成功"})
}