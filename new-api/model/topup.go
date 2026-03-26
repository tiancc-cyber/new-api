package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type TopUp struct {
	Id            int     `json:"id"`
	UserId        int     `json:"user_id" gorm:"index"`
	Amount        int64   `json:"amount"`
	Money         float64 `json:"money"`
	TradeNo       string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod string  `json:"payment_method" gorm:"type:varchar(50)"`
	CreateTime    int64   `json:"create_time"`
	CompleteTime  int64   `json:"complete_time"`
	Status        string  `json:"status"`
}

func getTopUpTradeNoColumn() string {
	if common.UsingPostgreSQL {
		return `"trade_no"`
	}
	return "`trade_no`"
}

func quotaFromTopUpMoney(money float64) int {
	dMoney := decimal.NewFromFloat(money)
	dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	return int(dMoney.Mul(dQuotaPerUnit).IntPart())
}

func quotaFromTopUpAmount(amount int64) int {
	dAmount := decimal.NewFromInt(amount)
	dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	return int(dAmount.Mul(dQuotaPerUnit).IntPart())
}

func getCreditedQuotaByTopUp(topUp *TopUp) (int, error) {
	if topUp == nil {
		return 0, errors.New("充值订单不存在")
	}
	var quota int
	switch topUp.PaymentMethod {
	case "stripe":
		quota = quotaFromTopUpMoney(topUp.Money)
	case "creem":
		quota = int(topUp.Amount)
	default:
		quota = quotaFromTopUpAmount(topUp.Amount)
	}
	if quota <= 0 {
		return 0, errors.New("无效的充值额度")
	}
	return quota, nil
}

func completeTopUpTx(tx *gorm.DB, topUp *TopUp, quota int, userUpdates map[string]any) (*Token, error) {
	if topUp == nil {
		return nil, errors.New("充值订单不存在")
	}
	if quota <= 0 {
		return nil, errors.New("无效的充值额度")
	}
	topUp.CompleteTime = common.GetTimestamp()
	topUp.Status = common.TopUpStatusSuccess
	if err := tx.Save(topUp).Error; err != nil {
		return nil, err
	}
	if userUpdates == nil {
		userUpdates = make(map[string]any)
	}
	userUpdates["quota"] = gorm.Expr("quota + ?", quota)
	if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(userUpdates).Error; err != nil {
		return nil, err
	}
	token, err := CreateRechargeTokenTx(tx, topUp.UserId, quota, topUp.TradeNo)
	if err != nil {
		return nil, err
	}
	return token, nil
}

func (topUp *TopUp) Insert() error {
	var err error
	err = DB.Create(topUp).Error
	return err
}

func (topUp *TopUp) Update() error {
	var err error
	err = DB.Save(topUp).Error
	return err
}

func GetTopUpById(id int) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("id = ?", id).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func GetTopUpByTradeNo(tradeNo string) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func Recharge(referenceId string, customerId string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	var quota int
	topUp := &TopUp{}
	var createdToken *Token

	refCol := getTopUpTradeNoColumn()

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		quota = quotaFromTopUpMoney(topUp.Money)
		createdToken, err = completeTopUpTx(tx, topUp, quota, map[string]any{"stripe_customer": customerId})
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("使用在线充值成功，订单号: %s，充值金额: %v，支付金额：%d，自动创建令牌：%s", topUp.TradeNo, logger.FormatQuota(quota), topUp.Amount, createdToken.Name))

	return nil
}

func RechargeEpay(referenceId string) (quota int, topUp *TopUp, err error) {
	if referenceId == "" {
		return 0, nil, errors.New("未提供支付单号")
	}

	topUp = &TopUp{}
	var createdToken *Token
	refCol := getTopUpTradeNoColumn()
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}
		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}
		quota = quotaFromTopUpAmount(topUp.Amount)
		createdToken, err = completeTopUpTx(tx, topUp, quota, nil)
		return err
	})
	if err != nil {
		common.SysError("epay topup failed: " + err.Error())
		return 0, nil, errors.New("充值失败，请稍后重试")
	}
	RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("使用在线充值成功，订单号: %s，充值金额: %v，支付金额：%f，自动创建令牌：%s", topUp.TradeNo, logger.FormatQuota(quota), topUp.Money, createdToken.Name))
	return quota, topUp, nil
}

func GetUserTopUps(userId int, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	// Start transaction
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Get total count within transaction
	err = tx.Model(&TopUp{}).Where("user_id = ?", userId).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated topups within same transaction
	err = tx.Where("user_id = ?", userId).Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Commit transaction
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllTopUps 获取全平台的充值记录（管理员使用）
func GetAllTopUps(pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&TopUp{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// SearchUserTopUps 按订单号搜索某用户的充值记录
func SearchUserTopUps(userId int, keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{}).Where("user_id = ?", userId)
	if keyword != "" {
		like := "%%" + keyword + "%%"
		query = query.Where("trade_no LIKE ?", like)
	}

	if err = query.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// SearchAllTopUps 按订单号搜索全平台充值记录（管理员使用）
func SearchAllTopUps(keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{})
	if keyword != "" {
		like := "%%" + keyword + "%%"
		query = query.Where("trade_no LIKE ?", like)
	}

	if err = query.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// ManualCompleteTopUp 管理员手动完成订单并给用户充值
func ManualCompleteTopUp(tradeNo string) error {
	if tradeNo == "" {
		return errors.New("未提供订单号")
	}

	refCol := getTopUpTradeNoColumn()

	var userId int
	var quotaToAdd int
	var payMoney float64
	var alreadyCompleted bool
	var createdToken *Token

	err := DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		// 行级锁，避免并发补单
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}

		// 幂等处理：已成功直接返回
		if topUp.Status == common.TopUpStatusSuccess {
			alreadyCompleted = true
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("订单状态不是待支付，无法补单")
		}

		creditedQuota, quotaErr := getCreditedQuotaByTopUp(topUp)
		if quotaErr != nil {
			return quotaErr
		}
		quotaToAdd = creditedQuota

		var completeErr error
		createdToken, completeErr = completeTopUpTx(tx, topUp, quotaToAdd, nil)
		if completeErr != nil {
			return completeErr
		}

		userId = topUp.UserId
		payMoney = topUp.Money
		return nil
	})

	if err != nil {
		return err
	}
	if alreadyCompleted {
		return nil
	}

	// 事务外记录日志，避免阻塞
	RecordLog(userId, LogTypeTopup, fmt.Sprintf("管理员补单成功，订单号: %s，充值金额: %v，支付金额：%f，自动创建令牌：%s", tradeNo, logger.FormatQuota(quotaToAdd), payMoney, createdToken.Name))
	return nil
}

func RechargeCreem(referenceId string, customerEmail string, _ string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	var quota int64
	topUp := &TopUp{}
	var createdToken *Token

	refCol := getTopUpTradeNoColumn()

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		// Creem 直接使用 Amount 作为充值额度（整数）
		quota = topUp.Amount

		// 构建更新字段，优先使用邮箱，如果邮箱为空则使用用户名
		updateFields := map[string]any{}

		// 如果有客户邮箱，尝试更新用户邮箱（仅当用户邮箱为空时）
		if customerEmail != "" {
			// 先检查用户当前邮箱是否为空
			var user User
			err = tx.Where("id = ?", topUp.UserId).First(&user).Error
			if err != nil {
				return err
			}

			// 如果用户邮箱为空，则更新为支付时使用的邮箱
			if user.Email == "" {
				updateFields["email"] = customerEmail
			}
		}

		createdToken, err = completeTopUpTx(tx, topUp, int(quota), updateFields)
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("creem topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("使用Creem充值成功，订单号: %s，充值额度: %v，支付金额：%.2f，自动创建令牌：%s", topUp.TradeNo, quota, topUp.Money, createdToken.Name))

	return nil
}
