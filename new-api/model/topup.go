package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"

	"github.com/bytedance/gopkg/util/gopool"
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

	// 一个发票可以包含多条充值记录（TopUp），通过 join table invoice_topups 关联
	Invoices []Invoice `gorm:"many2many:invoice_topups;joinForeignKey:TopUpID;joinReferences:InvoiceID" json:"invoices,omitempty"`
}

// ---- Billing / invoice filters ----

type TopUpInvoiceFilter string

const (
	TopUpInvoiceFilterAll         TopUpInvoiceFilter = "all"
	TopUpInvoiceFilterInvoiceable TopUpInvoiceFilter = "invoiceable"
	TopUpInvoiceFilterInvoiced    TopUpInvoiceFilter = "invoiced"
)

func normalizeTopUpInvoiceFilter(v string) TopUpInvoiceFilter {
	switch v {
	case string(TopUpInvoiceFilterInvoiceable):
		return TopUpInvoiceFilterInvoiceable
	case string(TopUpInvoiceFilterInvoiced):
		return TopUpInvoiceFilterInvoiced
	default:
		return TopUpInvoiceFilterAll
	}
}

func applyTopUpInvoiceFilter(q *gorm.DB, f TopUpInvoiceFilter) *gorm.DB {
	// NOTE: TopUp is linked to Invoice via join table invoice_topups:
	// invoice_topups(top_up_id, invoice_id)
	//
	// Cross-DB compatible strategy:
	// - invoiced: INNER JOIN invoice_topups
	// - invoiceable: LEFT JOIN invoice_topups + invoice_id IS NULL
	//
	// Do NOT select extra fields to avoid breaking existing TopUp JSON.
	switch f {
	case TopUpInvoiceFilterInvoiced:
		return q.Joins("JOIN invoice_topups it ON it.top_up_id = top_ups.id")
	case TopUpInvoiceFilterInvoiceable:
		return q.
			Joins("LEFT JOIN invoice_topups it ON it.top_up_id = top_ups.id").
			Where("it.invoice_id IS NULL")
	default:
		return q
	}
}

func applyTopUpInvoiceableBusinessRules(q *gorm.DB) *gorm.DB {
	// Frontend defines invoiceable as:
	// - status = success
	// - not subscription topup: NOT (amount = 0 AND trade_no starts with 'sub')
	// Implemented in SQL for correct pagination.
	//
	// trade_no prefix check: use LIKE 'sub%'
	return q.Where("status = ?", common.TopUpStatusSuccess).
		Where("NOT (amount = 0 AND trade_no LIKE ?)", "sub%")
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

// completeTopUpTx completes a recharge order by crediting user quota and marking the TopUp as success.
// IMPORTANT: Recharge records must only be retained in TopUp billing records.
// We must NOT auto-create tokens or insert records into token management / usage logs here.
func completeTopUpTx(tx *gorm.DB, topUp *TopUp, quota int, userUpdates map[string]any) error {
	if topUp == nil {
		return errors.New("充值订单不存在")
	}
	if quota <= 0 {
		return errors.New("无效的充值额度")
	}
	topUp.CompleteTime = common.GetTimestamp()
	topUp.Status = common.TopUpStatusSuccess
	if err := tx.Save(topUp).Error; err != nil {
		return err
	}
	if userUpdates == nil {
		userUpdates = make(map[string]any)
	}
	userUpdates["quota"] = gorm.Expr("quota + ?", quota)
	if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(userUpdates).Error; err != nil {
		return err
	}
	// Best-effort: update/invalidate user cache so balance becomes visible immediately.
	// This must not break the transaction if Redis is unavailable.
	if common.RedisEnabled {
		gopool.Go(func() {
			if err := cacheIncrUserQuota(topUp.UserId, int64(quota)); err != nil {
				common.SysLog("failed to increase user quota cache after topup: " + err.Error())
			}
		})
	}
	return nil
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
		return completeTopUpTx(tx, topUp, quota, map[string]any{"stripe_customer": customerId})
	})

	if err != nil {
		common.SysError("topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	return nil
}

func RechargeEpay(referenceId string) (quota int, topUp *TopUp, err error) {
	if referenceId == "" {
		return 0, nil, errors.New("未提供支付单号")
	}

	topUp = &TopUp{}
	refCol := getTopUpTradeNoColumn()
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}
		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}
		quota = quotaFromTopUpAmount(topUp.Amount)
		return completeTopUpTx(tx, topUp, quota, nil)
	})
	if err != nil {
		common.SysError("epay topup failed: " + err.Error())
		return 0, nil, errors.New("充值失败，请稍后重试")
	}
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

// GetUserTopUpsWithFilters returns paginated topups for a user with keyword and invoice_filter applied.
func GetUserTopUpsWithFilters(userId int, keyword string, invoiceFilter string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	q := tx.Model(&TopUp{}).Where("user_id = ?", userId)
	if keyword != "" {
		like := "%%" + keyword + "%%"
		q = q.Where("trade_no LIKE ?", like)
	}

	f := normalizeTopUpInvoiceFilter(invoiceFilter)
	q = applyTopUpInvoiceFilter(q, f)
	if f == TopUpInvoiceFilterInvoiceable {
		q = applyTopUpInvoiceableBusinessRules(q)
	}

	if err = q.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = q.Order("top_ups.id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
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

// GetAllTopUpsWithFilters returns paginated topups across all users with keyword and invoice_filter applied.
func GetAllTopUpsWithFilters(keyword string, invoiceFilter string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	q := tx.Model(&TopUp{})
	if keyword != "" {
		like := "%%" + keyword + "%%"
		q = q.Where("trade_no LIKE ?", like)
	}
	f := normalizeTopUpInvoiceFilter(invoiceFilter)
	q = applyTopUpInvoiceFilter(q, f)
	if f == TopUpInvoiceFilterInvoiceable {
		q = applyTopUpInvoiceableBusinessRules(q)
	}

	if err = q.Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = q.Order("top_ups.id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&topups).Error; err != nil {
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
		completeErr = completeTopUpTx(tx, topUp, quotaToAdd, nil)
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
	_ = userId
	_ = payMoney
	return nil
}

// CancelTopUpByTradeNo 用户取消支付，将待支付订单标记为已取消。
// 幂等：已成功/已过期/已取消都会直接返回 nil。
func CancelTopUpByTradeNo(tradeNo string, userId int) error {
	if tradeNo == "" {
		return errors.New("未提供订单号")
	}
	if userId <= 0 {
		return errors.New("无效的用户")
	}

	refCol := getTopUpTradeNoColumn()

	return DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}
		if topUp.UserId != userId {
			return errors.New("无权限")
		}

		// 已终态直接返回（幂等）
		if topUp.Status == common.TopUpStatusSuccess || topUp.Status == common.TopUpStatusExpired || topUp.Status == common.TopUpStatusCanceled {
			return nil
		}
		if topUp.Status != common.TopUpStatusPending {
			return errors.New("订单状态错误")
		}

		topUp.Status = common.TopUpStatusCanceled
		topUp.CompleteTime = common.GetTimestamp()
		return tx.Save(topUp).Error
	})
}

func RechargeCreem(referenceId string, customerEmail string, _ string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	var quota int64
	topUp := &TopUp{}

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

		return completeTopUpTx(tx, topUp, int(quota), updateFields)
	})

	if err != nil {
		common.SysError("creem topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	return nil
}
