package controller

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/native"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

type WeChatPayRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
}

type WeChatPayConfig struct {
	MchID        string `json:"mch_id"`
	AppID        string `json:"app_id"`
	APIv3Key     string `json:"api_v3_key"`
	PrivateKey   string `json:"private_key"`
	CertSerial   string `json:"cert_serial"`
	PublicKeyID  string `json:"public_key_id"`
	PublicKeyPEM string `json:"public_key_pem"`
	Enabled      bool   `json:"enabled"`
}

type WeChatPayQueryRequest struct {
	TradeNo string `json:"trade_no" binding:"required"`
}

type WeChatPayQueryResponse struct {
	TradeNo     string  `json:"trade_no"`
	TradeState  string  `json:"trade_state"`
	Paid        bool    `json:"paid"`
	Credited    bool    `json:"credited"`
	TotalCents  int64   `json:"total_cents"`
	TotalAmount float64 `json:"total_amount"`
}

type TopUpCancelRequest struct {
	TradeNo string `json:"trade_no" binding:"required"`
}

var wechatPayConfig = WeChatPayConfig{
	MchID:        setting.WeChatPayMchID,
	AppID:        setting.WeChatPayAppID,
	APIv3Key:     setting.WeChatPayAPIv3Key,
	PrivateKey:   setting.WeChatPayPrivateKey,
	CertSerial:   setting.WeChatPayCertSerial,
	PublicKeyID:  setting.WeChatPayPublicKeyID,
	PublicKeyPEM: setting.WeChatPayPublicKeyPEM,
	Enabled:      setting.WeChatPayEnabled,
}

func GetWeChatPayClient() (*core.Client, error) {
	if !wechatPayConfig.Enabled || wechatPayConfig.MchID == "" || wechatPayConfig.AppID == "" || wechatPayConfig.PrivateKey == "" {
		return nil, fmt.Errorf("微信支付配置不完整")
	}

	mchPrivateKey, err := utils.LoadPrivateKey(wechatPayConfig.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("加载商户私钥失败: %v", err)
	}

	ctx := context.Background()

	var opts []core.ClientOption
	// 新版推荐：使用“微信支付公钥”验签/加解密（商户平台 API 安全申请）
	if wechatPayConfig.PublicKeyID != "" && wechatPayConfig.PublicKeyPEM != "" {
		pubKey, err := utils.LoadPublicKey(wechatPayConfig.PublicKeyPEM)
		if err != nil {
			return nil, fmt.Errorf("加载微信支付公钥失败: %v", err)
		}
		opts = append(opts, option.WithWechatPayPublicKeyAuthCipher(
			wechatPayConfig.MchID,
			wechatPayConfig.CertSerial,
			mchPrivateKey,
			wechatPayConfig.PublicKeyID,
			pubKey,
		))
	} else {
		// 兼容旧版：使用平台证书自动下载（需要 APIv3Key + 平台证书可用）
		if wechatPayConfig.APIv3Key == "" {
			return nil, fmt.Errorf("微信支付配置不完整")
		}
		opts = append(opts, option.WithWechatPayAutoAuthCipher(
			wechatPayConfig.MchID,
			wechatPayConfig.CertSerial,
			mchPrivateKey,
			wechatPayConfig.APIv3Key,
		))
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
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	if req.Amount < getMinTopup() {
		common.ApiErrorMsg(c, fmt.Sprintf("充值数量不能小于 %d", getMinTopup()))
		return
	}

	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		common.ApiErrorMsg(c, "获取用户分组失败")
		return
	}

	payMoney := getPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		common.ApiErrorMsg(c, "充值金额过低")
		return
	}

	if !operation_setting.ContainsPayMethod(req.PaymentMethod) {
		common.ApiErrorMsg(c, "支付方式不存在")
		return
	}

	if req.PaymentMethod != "wxpay" {
		common.ApiErrorMsg(c, "仅支持微信支付")
		return
	}

	client, err := GetWeChatPayClient()
	if err != nil {
		logger.LogError(c.Request.Context(), "创建微信支付客户端失败: "+err.Error())
		common.ApiErrorMsg(c, "微信支付配置错误")
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
		logger.LogError(c.Request.Context(), "微信支付预下单失败: "+err.Error())
		common.ApiErrorMsg(c, "创建支付订单失败")
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
		common.ApiErrorMsg(c, "创建订单失败")
		return
	}

	data := gin.H{
		"code_url": *resp.CodeUrl,
		"trade_no": tradeNo,
	}
	// 统一返回格式：
	// {"success":true,"message":"success","data":{...}}
	// 以适配前端判断逻辑：message === 'success'
	common.ApiSuccess(c, data)
}

// RefreshWeChatPayQRCode 刷新二维码（保持订单号不变，不新增充值记录）。
// 仅允许待支付订单刷新。
func RefreshWeChatPayQRCode(c *gin.Context) {
	var req WeChatPayQueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	userId := c.GetInt("id")
	topUp := model.GetTopUpByTradeNo(req.TradeNo)
	if topUp == nil {
		common.ApiErrorMsg(c, "订单不存在")
		return
	}
	if topUp.UserId != userId {
		common.ApiErrorMsg(c, "无权限")
		return
	}
	if topUp.Status != common.TopUpStatusPending {
		common.ApiErrorMsg(c, "订单状态不支持刷新")
		return
	}

	client, err := GetWeChatPayClient()
	if err != nil {
		logger.LogError(c.Request.Context(), "创建微信支付客户端失败: "+err.Error())
		common.ApiErrorMsg(c, "微信支付配置错误")
		return
	}

	svc := native.NativeApiService{Client: client}
	ctx := context.Background()

	callBackAddress := service.GetCallbackAddress()
	notifyUrl := callBackAddress + "/api/user/wechatpay/notify"

	// 复用订单号，重新预下单获取新的 code_url
	payMoneyCents := int64(topUp.Money * 100)
	reqService := native.PrepayRequest{
		Appid:       core.String(wechatPayConfig.AppID),
		Mchid:       core.String(wechatPayConfig.MchID),
		Description: core.String(fmt.Sprintf("TUC%d", topUp.Amount)),
		OutTradeNo:  core.String(req.TradeNo),
		NotifyUrl:   core.String(notifyUrl),
		Amount:      &native.Amount{Total: core.Int64(payMoneyCents)},
	}

	resp, _, err := svc.Prepay(ctx, reqService)
	if err != nil {
		logger.LogError(c.Request.Context(), "微信支付刷新预下单失败: "+err.Error())
		common.ApiErrorMsg(c, "刷新二维码失败")
		return
	}

	data := gin.H{
		"code_url": *resp.CodeUrl,
		"trade_no": req.TradeNo,
	}
	common.ApiSuccess(c, data)
}

func WeChatPayNotify(c *gin.Context) {
	// 微信支付回调要求返回 JSON：{"code":"SUCCESS","message":"成功"}
	respSuccess := func() {
		c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "成功"})
	}
	respFail := func(msg string) {
		c.JSON(http.StatusBadRequest, gin.H{"code": "FAIL", "message": msg})
	}

	// 1) 准备验签 verifier（优先公钥模式，其次兼容平台证书模式）
	var verifier auth.Verifier
	var err error

	// 2) 使用 notify.Handler 完成：验签 + 解密 resource.plaintext + 解析到 payments.Transaction
	// 解密仍需要 APIv3Key（微信通知资源体为 AEAD_AES_256_GCM，密钥为 APIv3Key）
	if wechatPayConfig.APIv3Key == "" {
		respFail("APIv3密钥未配置")
		return
	}

	// verifier: 公钥模式（推荐）
	if wechatPayConfig.PublicKeyID != "" && wechatPayConfig.PublicKeyPEM != "" {
		pubKey, loadErr := utils.LoadPublicKey(wechatPayConfig.PublicKeyPEM)
		if loadErr != nil {
			logger.LogError(c.Request.Context(), "加载微信支付公钥失败: "+loadErr.Error())
			respFail("公钥配置错误")
			return
		}
		verifier = verifiers.NewSHA256WithRSAPubkeyVerifier(wechatPayConfig.PublicKeyID, *pubKey)
	}

	// verifier: 平台证书模式（兼容旧方式，可能在你的商户号上不可用）
	if verifier == nil {
		client, clientErr := GetWeChatPayClient()
		if clientErr != nil {
			logger.LogError(c.Request.Context(), "创建微信支付客户端失败: "+clientErr.Error())
			respFail("创建客户端失败")
			return
		}
		// client 内置了 response validator 的 verifier，但 notify 需要 auth.Verifier。
		// 这里没有直接暴露出来，因此平台证书模式下的 notify 解析需要显式构建 verifier。
		// 为避免引入复杂证书下载逻辑，本分支直接提示配置公钥模式。
		_ = client
		respFail("请配置微信支付公钥用于回调验签")
		return
	}

	handler, err := notify.NewRSANotifyHandler(wechatPayConfig.APIv3Key, verifier)
	if err != nil {
		logger.LogError(c.Request.Context(), "创建通知处理器失败: "+err.Error())
		respFail("通知处理器初始化失败")
		return
	}

	content := new(payments.Transaction)
	_, err = handler.ParseNotifyRequest(context.Background(), c.Request, content)
	if err != nil {
		logger.LogError(c.Request.Context(), "解析微信支付通知失败: "+err.Error())
		respFail("通知验签失败")
		return
	}

	// 3) 转换通知内容
	tradeNo := ""
	if content.OutTradeNo != nil {
		tradeNo = *content.OutTradeNo
	}
	if tradeNo == "" {
		respFail("缺少订单号")
		return
	}

	transactionId := ""
	if content.TransactionId != nil {
		transactionId = *content.TransactionId
	}

	tradeState := ""
	if content.TradeState != nil {
		tradeState = *content.TradeState
	}

	totalCents := int64(0)
	if content.Amount != nil && content.Amount.Total != nil {
		totalCents = *content.Amount.Total
	}
	totalAmount := float64(totalCents) / 100.0

	// 4) 订单入账（幂等）：只有 SUCCESS 才入账
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		logger.LogError(c.Request.Context(), "获取订单失败: 订单不存在, trade_no="+tradeNo)
		// 微信回调应尽量返回 SUCCESS 避免重复通知风暴，但这里订单不存在属于异常。
		// 返回 FAIL 方便排查。
		respFail("订单不存在")
		return
	}

	if topUp.Status == common.TopUpStatusSuccess {
		respSuccess()
		return
	}

	if tradeState == "SUCCESS" {
		// 以微信回调金额为准
		topUp.Money = totalAmount
		if err := topUp.Update(); err != nil {
			logger.LogError(c.Request.Context(), "更新订单金额失败: "+err.Error())
			respFail("更新订单失败")
			return
		}

		if err := model.ManualCompleteTopUp(tradeNo); err != nil {
			logger.LogError(c.Request.Context(), "完成微信支付充值失败: "+err.Error())
			respFail("入账失败")
			return
		}

		logger.LogInfo(c.Request.Context(), fmt.Sprintf("用户 %d 充值成功，订单号: %s，交易号: %s，金额: %.2f", topUp.UserId, tradeNo, transactionId, totalAmount))
		respSuccess()
		return
	}

	logger.LogWarn(c.Request.Context(), fmt.Sprintf("微信支付未成功状态=%s，订单号: %s", tradeState, tradeNo))
	respSuccess()
}

// QueryWeChatPayByTradeNo 用户点击“我已支付”后主动查询订单真实状态。
// 若微信返回已支付则会将订单置为 success 并为用户入账（幂等）。
func QueryWeChatPayByTradeNo(c *gin.Context) {
	var req WeChatPayQueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	userId := c.GetInt("id")
	topUp := model.GetTopUpByTradeNo(req.TradeNo)
	if topUp == nil {
		common.ApiErrorMsg(c, "订单不存在")
		return
	}
	if topUp.UserId != userId {
		common.ApiErrorMsg(c, "无权限")
		return
	}

	// 已成功直接返回
	if topUp.Status == common.TopUpStatusSuccess {
		common.ApiSuccess(c, WeChatPayQueryResponse{TradeNo: req.TradeNo, TradeState: "SUCCESS", Paid: true, Credited: true, TotalAmount: topUp.Money, TotalCents: int64(topUp.Money * 100)})
		return
	}

	client, err := GetWeChatPayClient()
	if err != nil {
		logger.LogError(c.Request.Context(), "创建微信支付客户端失败: "+err.Error())
		common.ApiErrorMsg(c, "微信支付配置错误")
		return
	}

	svc := native.NativeApiService{Client: client}
	ctx := context.Background()

	queryResp, _, err := svc.QueryOrderByOutTradeNo(ctx, native.QueryOrderByOutTradeNoRequest{
		Mchid:      core.String(wechatPayConfig.MchID),
		OutTradeNo: core.String(req.TradeNo),
	})
	if err != nil {
		logger.LogError(c.Request.Context(), "查询微信订单失败: "+err.Error())
		common.ApiErrorMsg(c, "查询失败，请稍后重试")
		return
	}

	tradeState := ""
	if queryResp.TradeState != nil {
		tradeState = *queryResp.TradeState
	}

	paid := tradeState == "SUCCESS"
	totalCents := int64(0)
	if queryResp.Amount != nil && queryResp.Amount.Total != nil {
		totalCents = *queryResp.Amount.Total
	}
	totalAmount := float64(totalCents) / 100.0

	credited := false
	if paid {
		// 以微信返回金额为准（可在此处做更严格校验），再入账
		topUp.Money = totalAmount
		if err := topUp.Update(); err != nil {
			logger.LogError(c.Request.Context(), "更新订单金额失败: "+err.Error())
			common.ApiErrorMsg(c, "入账失败，请稍后重试")
			return
		}
		if err := model.ManualCompleteTopUp(req.TradeNo); err != nil {
			logger.LogError(c.Request.Context(), "完成微信支付充值失败: "+err.Error())
			common.ApiErrorMsg(c, err.Error())
			return
		}
		credited = true
	}

	common.ApiSuccess(c, WeChatPayQueryResponse{
		TradeNo:     req.TradeNo,
		TradeState:  tradeState,
		Paid:        paid,
		Credited:    credited,
		TotalCents:  totalCents,
		TotalAmount: totalAmount,
	})
}

// CancelWeChatPayTopUp 用户取消支付，将订单标记为已取消（幂等）。
func CancelWeChatPayTopUp(c *gin.Context) {
	var req TopUpCancelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误")
		return
	}
	userId := c.GetInt("id")
	if err := model.CancelTopUpByTradeNo(req.TradeNo, userId); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, gin.H{"trade_no": req.TradeNo})
}

func GetWeChatPayConfig(c *gin.Context) {
	data := gin.H{
		"enabled":        setting.WeChatPayEnabled,
		"mch_id":         setting.WeChatPayMchID,
		"app_id":         setting.WeChatPayAppID,
		"api_v3_key":     setting.WeChatPayAPIv3Key,
		"private_key":    setting.WeChatPayPrivateKey,
		"cert_serial":    setting.WeChatPayCertSerial,
		"public_key_id":  setting.WeChatPayPublicKeyID,
		"public_key_pem": setting.WeChatPayPublicKeyPEM,
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
	setting.WeChatPayPublicKeyID = config.PublicKeyID
	setting.WeChatPayPublicKeyPEM = config.PublicKeyPEM

	// 同步到wechatPayConfig变量
	wechatPayConfig = WeChatPayConfig{
		MchID:        setting.WeChatPayMchID,
		AppID:        setting.WeChatPayAppID,
		APIv3Key:     setting.WeChatPayAPIv3Key,
		PrivateKey:   setting.WeChatPayPrivateKey,
		CertSerial:   setting.WeChatPayCertSerial,
		PublicKeyID:  setting.WeChatPayPublicKeyID,
		PublicKeyPEM: setting.WeChatPayPublicKeyPEM,
		Enabled:      setting.WeChatPayEnabled,
	}

	if config.Enabled && config.MchID != "" && config.AppID != "" && config.PrivateKey != "" {
		// public key 模式与 auto-cert 模式二选一即可：
		// - public key: PublicKeyID + PublicKeyPEM
		// - auto-cert : APIv3Key
		if (config.PublicKeyID == "" || config.PublicKeyPEM == "") && config.APIv3Key == "" {
			c.JSON(200, gin.H{"message": "error", "data": "微信支付配置不完整"})
			return
		}
		_, err := GetWeChatPayClient()
		if err != nil {
			c.JSON(200, gin.H{"message": "error", "data": "微信支付配置验证失败: " + err.Error()})
			return
		}
	}

	c.JSON(200, gin.H{"message": "success", "data": "微信支付配置更新成功"})
}
