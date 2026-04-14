package service

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

type InvoiceListParams struct {
	UserID     int
	Page       int
	PageSize   int
	SubjectKey string
}

func normalizePage(page, pageSize int) (int, int) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func CreateInvoiceSubject(userID int, req dto.InvoiceSubjectUpsertRequest) (*model.InvoiceSubject, error) {
	tt := strings.TrimSpace(req.TitleType)
	if tt == "" {
		tt = "单位"
	}
	if tt != "个人" && tt != "单位" {
		return nil, errors.New("抬头类型仅支持 个人 或 单位")
	}
	if strings.TrimSpace(req.TitleName) == "" {
		return nil, errors.New("抬头名称不能为空")
	}
	if strings.TrimSpace(req.ReceiveMethod) == "" {
		return nil, errors.New("接收方式不能为空")
	}
	// receive_method: phone/email
	method := strings.ToLower(strings.TrimSpace(req.ReceiveMethod))
	if method != "phone" && method != "email" {
		return nil, errors.New("接收方式仅支持 phone 或 email")
	}
	if strings.TrimSpace(req.ReceiveInfo) == "" {
		return nil, errors.New("接收信息不能为空")
	}

	// upsert：单位抬头按 (user_id, tax_no) 视为唯一；若已存在则覆盖更新（保留 unique_key）。
	// 个人抬头不做该 upsert，避免同名误覆盖。
	if tt == "单位" {
		taxNo := ""
		if req.TaxNo != nil {
			taxNo = strings.TrimSpace(*req.TaxNo)
		}
		if taxNo != "" {
			var existed model.InvoiceSubject
			err := model.DB.Where("user_id = ? AND tax_no = ?", userID, taxNo).First(&existed).Error
			if err == nil {
				existed.TitleType = tt
				existed.TitleName = strings.TrimSpace(req.TitleName)
				existed.TaxNo = req.TaxNo
				existed.RegisteredAddress = req.RegisteredAddress
				existed.RegisteredPhone = req.RegisteredPhone
				existed.BankName = req.BankName
				existed.BankAccount = req.BankAccount
				existed.ReceiveMethod = method
				existed.ReceiveInfo = strings.TrimSpace(req.ReceiveInfo)
				if err := model.DB.Model(&model.InvoiceSubject{}).Where("id = ?", existed.ID).
					Select("title_type", "title_name", "tax_no", "registered_address", "registered_phone", "bank_name", "bank_account", "receive_method", "receive_info").
					Updates(&existed).Error; err != nil {
					return nil, err
				}
				return &existed, nil
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, err
			}
		}
	}

	uniqueKey := ""
	if req.UniqueKey != nil {
		uniqueKey = strings.TrimSpace(*req.UniqueKey)
	}
	if uniqueKey == "" {
		uniqueKey = common.GetUUID()
	}

	subj := &model.InvoiceSubject{
		UniqueKey:         uniqueKey,
		TitleType:         tt,
		TitleName:         strings.TrimSpace(req.TitleName),
		TaxNo:             req.TaxNo,
		RegisteredAddress: req.RegisteredAddress,
		RegisteredPhone:   req.RegisteredPhone,
		BankName:          req.BankName,
		BankAccount:       req.BankAccount,
		ReceiveMethod:     method,
		ReceiveInfo:       strings.TrimSpace(req.ReceiveInfo),
		UserID:            userID,
	}

	if err := model.DB.Create(subj).Error; err != nil {
		return nil, err
	}
	return subj, nil
}

func ListInvoiceSubjects(userID int) ([]*model.InvoiceSubject, error) {
	var items []*model.InvoiceSubject
	err := model.DB.Where("user_id = ?", userID).Order("id desc").Find(&items).Error
	return items, err
}

func DeleteInvoiceSubject(userID int, uniqueKey string) error {
	if strings.TrimSpace(uniqueKey) == "" {
		return errors.New("unique_key 不能为空")
	}
	// 不允许删除已被发票引用的主体
	var cnt int64
	if err := model.DB.Model(&model.Invoice{}).Where("subject_unique_key = ?", uniqueKey).Count(&cnt).Error; err != nil {
		return err
	}
	if cnt > 0 {
		return errors.New("该发票主体已被使用，无法删除")
	}
	return model.DB.Where("user_id = ? AND unique_key = ?", userID, uniqueKey).Delete(&model.InvoiceSubject{}).Error
}

func CreateInvoice(userID int, req dto.InvoiceCreateRequest) (*model.Invoice, error) {
	if strings.TrimSpace(req.InvoiceType) == "" {
		return nil, errors.New("发票类型不能为空")
	}
	if strings.TrimSpace(req.InvoiceContent) == "" {
		return nil, errors.New("发票内容不能为空")
	}
	if strings.TrimSpace(req.TitleType) == "" {
		return nil, errors.New("抬头类型不能为空")
	}
	if strings.TrimSpace(req.SubjectUniqueKey) == "" {
		return nil, errors.New("发票主体不能为空")
	}
	if len(req.TopUpIDs) == 0 {
		return nil, errors.New("topup_ids 不能为空")
	}

	// 校验主体归属
	var subj model.InvoiceSubject
	if err := model.DB.Where("user_id = ? AND unique_key = ?", userID, req.SubjectUniqueKey).First(&subj).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("发票主体不存在")
		}
		return nil, err
	}

	// 仅允许对自己的 topup 开票；且 topup 必须 success；且未被任何发票使用
	var topups []*model.TopUp
	// TopUp 主键字段为 Id，但 GORM 默认列名仍为 `id`
	if err := model.DB.Where("user_id = ? AND id IN ?", userID, req.TopUpIDs).Find(&topups).Error; err != nil {
		return nil, err
	}
	if len(topups) == 0 {
		return nil, errors.New("未找到可开票账单（请确认账单归属当前账号且 topup_ids 正确）")
	}
	invoiceableIDs := make([]int, 0, len(topups))
	for _, t := range topups {
		if t.Status != common.TopUpStatusSuccess {
			continue
		}
		// 订阅套餐充值过滤：amount==0 且 trade_no 前缀 sub
		trade := strings.ToLower(strings.TrimSpace(t.TradeNo))
		if t.Amount == 0 && strings.HasPrefix(trade, "sub") {
			continue
		}
		invoiceableIDs = append(invoiceableIDs, t.Id)
	}
	if len(invoiceableIDs) == 0 {
		return nil, errors.New("选择的账单均不可开票（仅支持状态为 success 的账单）")
	}

	// 检查是否已被开票
	var used int64
	if err := model.DB.Model(&model.InvoiceTopUp{}).Where("top_up_id IN ?", invoiceableIDs).Count(&used).Error; err != nil {
		return nil, err
	}
	if used > 0 {
		return nil, errors.New("所选账单中包含已开票记录")
	}

	inv := &model.Invoice{
		InvoiceType:      strings.TrimSpace(req.InvoiceType),
		InvoiceContent:   strings.TrimSpace(req.InvoiceContent),
		TitleType:        strings.TrimSpace(req.TitleType),
		SubjectUniqueKey: req.SubjectUniqueKey,
		UserID:           userID,
		Status:           "pending",
	}

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(inv).Error; err != nil {
			return err
		}
		links := make([]model.InvoiceTopUp, 0, len(invoiceableIDs))
		for _, id := range invoiceableIDs {
			links = append(links, model.InvoiceTopUp{InvoiceID: inv.ID, TopUpID: id})
		}
		if err := tx.Create(&links).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// 预载返回
	_ = model.DB.Preload("Subject").Preload("TopUps").First(inv, inv.ID).Error
	return inv, nil
}

func ListInvoices(userID int, page, pageSize int) ([]*model.Invoice, int64, error) {
	page, pageSize = normalizePage(page, pageSize)
	var total int64
	q := model.DB.Model(&model.Invoice{}).Where("user_id = ?", userID)
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []*model.Invoice
	err := q.Order("id desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Preload("TopUps").
		Find(&items).Error
	if err != nil {
		return nil, 0, err
	}

	// 关联主体（不改表，仅查询时关联）：批量查询 invoice_subjects 并回填到 items.Subject
	keys := make([]string, 0, len(items))
	keySeen := make(map[string]struct{}, len(items))
	for _, it := range items {
		if it == nil {
			continue
		}
		k := strings.TrimSpace(it.SubjectUniqueKey)
		if k == "" {
			continue
		}
		if _, ok := keySeen[k]; ok {
			continue
		}
		keySeen[k] = struct{}{}
		keys = append(keys, k)
	}
	if len(keys) > 0 {
		var subs []*model.InvoiceSubject
		if err := model.DB.Where("user_id = ? AND unique_key IN ?", userID, keys).Find(&subs).Error; err != nil {
			return nil, 0, err
		}
		subMap := make(map[string]*model.InvoiceSubject, len(subs))
		for _, s := range subs {
			if s == nil {
				continue
			}
			subMap[strings.TrimSpace(s.UniqueKey)] = s
		}
		for _, it := range items {
			if it == nil {
				continue
			}
			if it.Subject != nil {
				continue
			}
			k := strings.TrimSpace(it.SubjectUniqueKey)
			if k == "" {
				continue
			}
			if s, ok := subMap[k]; ok {
				it.Subject = s
			}
		}
	}

	return items, total, nil
}

// CreateInvoiceWithSubject 创建发票（可选：同时创建发票主体），并保证原子性。
//
// 约束：req.SubjectUniqueKey 与 req.Subject 二选一。
func CreateInvoiceWithSubject(userID int, req dto.InvoiceCreateWithSubjectRequest) (*model.Invoice, error) {
	if strings.TrimSpace(req.InvoiceType) == "" {
		return nil, errors.New("发票类型不能为空")
	}
	if strings.TrimSpace(req.InvoiceContent) == "" {
		return nil, errors.New("发票内容不能为空")
	}
	if strings.TrimSpace(req.TitleType) == "" {
		return nil, errors.New("抬头类型不能为空")
	}
	if len(req.TopUpIDs) == 0 {
		return nil, errors.New("topup_ids 不能为空")
	}

	subjectKey := strings.TrimSpace(req.SubjectUniqueKey)
	if subjectKey == "" && req.Subject == nil {
		return nil, errors.New("发票主体不能为空")
	}
	if subjectKey != "" && req.Subject != nil {
		return nil, errors.New("subject_unique_key 与 subject 不能同时传入")
	}
	if subjectKey == "" && req.SubjectUpdate != nil {
		return nil, errors.New("subject_update 只能在使用 subject_unique_key 时传入")
	}

	// 仅允许对自己的 topup 开票；且 topup 必须 success；且未被任何发票使用
	var topups []*model.TopUp
	// TopUp 主键字段为 Id，但 GORM 默认列名仍为 `id`
	common.SysLog(fmt.Sprintf("[invoice] CreateInvoiceWithSubject: user_id=%d, topup_ids=%v", userID, req.TopUpIDs))
	if err := model.DB.Where("user_id = ? AND id IN ?", userID, req.TopUpIDs).Find(&topups).Error; err != nil {
		return nil, err
	}
	if len(topups) == 0 {
		// 进一步定位：检查这些 topup_ids 是否存在（不带 user_id 限制）
		var exists []*model.TopUp
		_ = model.DB.Where("id IN ?", req.TopUpIDs).Find(&exists).Error
		common.SysLog("[invoice] CreateInvoiceWithSubject: topups not found by user scope. user_id=" + strconv.Itoa(userID) + ", exists_by_id_count=" + strconv.Itoa(len(exists)))
		if len(exists) > 0 {
			// id 存在但 user_id 不匹配
			return nil, errors.New("未找到可开票账单：账单不属于当前账号")
		}
		return nil, errors.New("未找到可开票账单（请确认账单归属当前账号且 topup_ids 正确）")
	}
	invoiceableIDs := make([]int, 0, len(topups))
	for _, t := range topups {
		if t.Status != common.TopUpStatusSuccess {
			continue
		}
		invoiceableIDs = append(invoiceableIDs, t.Id)
	}
	if len(invoiceableIDs) == 0 {
		return nil, errors.New("选择的账单均不可开票（仅支持状态为 success 的账单）")
	}

	// 先做一次快速检查（非事务内），减少无谓的事务。
	var used int64
	if err := model.DB.Model(&model.InvoiceTopUp{}).Where("top_up_id IN ?", invoiceableIDs).Count(&used).Error; err != nil {
		return nil, err
	}
	if used > 0 {
		return nil, errors.New("所选账单中包含已开票记录")
	}

	inv := &model.Invoice{}
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		// 1) 确定主体
		if subjectKey == "" {
			// 创建主体
			subj, err := createInvoiceSubjectTx(tx, userID, *req.Subject)
			if err != nil {
				return err
			}
			subjectKey = subj.UniqueKey
		} else {
			// 校验主体归属
			var subj model.InvoiceSubject
			if err := tx.Where("user_id = ? AND unique_key = ?", userID, subjectKey).First(&subj).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return errors.New("发票主体不存在")
				}
				return err
			}

			// 可选：回写更新（仅覆盖非 nil 字段）
			if req.SubjectUpdate != nil {
				upd := req.SubjectUpdate
				updates := map[string]any{}
				// 只允许更新主体信息本身；unique_key/user_id 由条件约束。
				if strings.TrimSpace(upd.TitleType) != "" {
					updates["title_type"] = strings.TrimSpace(upd.TitleType)
				}
				if strings.TrimSpace(upd.TitleName) != "" {
					updates["title_name"] = strings.TrimSpace(upd.TitleName)
				}
				if upd.TaxNo != nil {
					updates["tax_no"] = upd.TaxNo
				}
				if upd.RegisteredAddress != nil {
					updates["registered_address"] = upd.RegisteredAddress
				}
				if upd.RegisteredPhone != nil {
					updates["registered_phone"] = upd.RegisteredPhone
				}
				if upd.BankName != nil {
					updates["bank_name"] = upd.BankName
				}
				if upd.BankAccount != nil {
					updates["bank_account"] = upd.BankAccount
				}
				if strings.TrimSpace(upd.ReceiveMethod) != "" {
					updates["receive_method"] = strings.ToLower(strings.TrimSpace(upd.ReceiveMethod))
				}
				if strings.TrimSpace(upd.ReceiveInfo) != "" {
					updates["receive_info"] = strings.TrimSpace(upd.ReceiveInfo)
				}

				if len(updates) > 0 {
					if err := tx.Model(&model.InvoiceSubject{}).
						Where("user_id = ? AND unique_key = ?", userID, subjectKey).
						Updates(updates).Error; err != nil {
						return err
					}
				}
			}
		}

		// 2) 再次检查 topups 未被使用（事务内），防止并发下重复开票
		var usedInTx int64
		if err := tx.Model(&model.InvoiceTopUp{}).Where("top_up_id IN ?", invoiceableIDs).Count(&usedInTx).Error; err != nil {
			return err
		}
		if usedInTx > 0 {
			return errors.New("所选账单中包含已开票记录")
		}

		// 3) 创建发票与关联
		inv = &model.Invoice{
			InvoiceType:      strings.TrimSpace(req.InvoiceType),
			InvoiceContent:   strings.TrimSpace(req.InvoiceContent),
			TitleType:        strings.TrimSpace(req.TitleType),
			SubjectUniqueKey: subjectKey,
			UserID:           userID,
			Status:           "pending",
		}
		if err := tx.Create(inv).Error; err != nil {
			return err
		}
		links := make([]model.InvoiceTopUp, 0, len(invoiceableIDs))
		for _, id := range invoiceableIDs {
			links = append(links, model.InvoiceTopUp{InvoiceID: inv.ID, TopUpID: id})
		}
		if err := tx.Create(&links).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	_ = model.DB.Preload("Subject").Preload("TopUps").First(inv, inv.ID).Error
	return inv, nil
}

// AdminCreateInvoiceWithSubject 管理员代开票。
//
// 约束：
// - 发票与主体归属为 req.UserID（目标用户），管理员仅作为发起人。
// - subject_unique_key 与 subject 二选一。
// - topup_ids 必须全部归属同一个用户（且应等于 req.UserID），禁止跨用户合并。
func AdminCreateInvoiceWithSubject(req dto.AdminInvoiceCreateWithSubjectRequest) (*model.Invoice, error) {
	if req.UserID <= 0 {
		return nil, errors.New("user_id 不能为空")
	}
	if strings.TrimSpace(req.InvoiceType) == "" {
		return nil, errors.New("发票类型不能为空")
	}
	if strings.TrimSpace(req.InvoiceContent) == "" {
		return nil, errors.New("发票内容不能为空")
	}
	if strings.TrimSpace(req.TitleType) == "" {
		return nil, errors.New("抬头类型不能为空")
	}
	if len(req.TopUpIDs) == 0 {
		return nil, errors.New("topup_ids 不能为空")
	}

	subjectKey := strings.TrimSpace(req.SubjectUniqueKey)
	if subjectKey == "" && req.Subject == nil {
		return nil, errors.New("发票主体不能为空")
	}
	if subjectKey != "" && req.Subject != nil {
		return nil, errors.New("subject_unique_key 与 subject 不能同时传入")
	}

	// 管理员可查询任意用户 topup，但本次请求必须归属于 req.UserID。
	var topups []*model.TopUp
	if err := model.DB.Where("id IN ?", req.TopUpIDs).Find(&topups).Error; err != nil {
		return nil, err
	}
	if len(topups) == 0 {
		return nil, errors.New("未找到可开票账单（请确认 topup_ids 正确）")
	}
	for _, t := range topups {
		if t.UserId != req.UserID {
			return nil, errors.New("所选账单不属于同一用户，无法合并开票")
		}
	}

	invoiceableIDs := make([]int, 0, len(topups))
	for _, t := range topups {
		if t.Status != common.TopUpStatusSuccess {
			continue
		}
		// 与前端/普通开票入口一致：订阅套餐充值不提供开票
		trade := strings.ToLower(strings.TrimSpace(t.TradeNo))
		if t.Amount == 0 && strings.HasPrefix(trade, "sub") {
			continue
		}
		invoiceableIDs = append(invoiceableIDs, t.Id)
	}
	if len(invoiceableIDs) == 0 {
		return nil, errors.New("选择的账单均不可开票（仅支持状态为 success 的账单）")
	}

	// 先做一次快速检查（非事务内），减少无谓的事务。
	var used int64
	if err := model.DB.Model(&model.InvoiceTopUp{}).Where("top_up_id IN ?", invoiceableIDs).Count(&used).Error; err != nil {
		return nil, err
	}
	if used > 0 {
		return nil, errors.New("所选账单中包含已开票记录")
	}

	inv := &model.Invoice{}
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		// 1) 确定主体（归属目标用户）
		if subjectKey == "" {
			subj, err := createInvoiceSubjectTx(tx, req.UserID, *req.Subject)
			if err != nil {
				return err
			}
			subjectKey = subj.UniqueKey
		} else {
			var subj model.InvoiceSubject
			if err := tx.Where("user_id = ? AND unique_key = ?", req.UserID, subjectKey).First(&subj).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return errors.New("发票主体不存在")
				}
				return err
			}
		}

		// 2) 再次检查 topups 未被使用（事务内），防止并发下重复开票
		var usedInTx int64
		if err := tx.Model(&model.InvoiceTopUp{}).Where("top_up_id IN ?", invoiceableIDs).Count(&usedInTx).Error; err != nil {
			return err
		}
		if usedInTx > 0 {
			return errors.New("所选账单中包含已开票记录")
		}

		// 3) 创建发票与关联（归属目标用户）
		inv = &model.Invoice{
			InvoiceType:      strings.TrimSpace(req.InvoiceType),
			InvoiceContent:   strings.TrimSpace(req.InvoiceContent),
			TitleType:        strings.TrimSpace(req.TitleType),
			SubjectUniqueKey: subjectKey,
			UserID:           req.UserID,
			Status:           "pending",
		}
		if err := tx.Create(inv).Error; err != nil {
			return err
		}
		links := make([]model.InvoiceTopUp, 0, len(invoiceableIDs))
		for _, id := range invoiceableIDs {
			links = append(links, model.InvoiceTopUp{InvoiceID: inv.ID, TopUpID: id})
		}
		if err := tx.Create(&links).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	_ = model.DB.Preload("Subject").Preload("TopUps").First(inv, inv.ID).Error
	return inv, nil
}

func createInvoiceSubjectTx(tx *gorm.DB, userID int, req dto.InvoiceSubjectUpsertRequest) (*model.InvoiceSubject, error) {
	tt := strings.TrimSpace(req.TitleType)
	if tt == "" {
		tt = "单位"
	}
	if tt != "个人" && tt != "单位" {
		return nil, errors.New("抬头类型仅支持 个人 或 单位")
	}
	if strings.TrimSpace(req.TitleName) == "" {
		return nil, errors.New("抬头名称不能为空")
	}
	if strings.TrimSpace(req.ReceiveMethod) == "" {
		return nil, errors.New("接收方式不能为空")
	}
	method := strings.ToLower(strings.TrimSpace(req.ReceiveMethod))
	if method != "phone" && method != "email" {
		return nil, errors.New("接收方式仅支持 phone 或 email")
	}
	if strings.TrimSpace(req.ReceiveInfo) == "" {
		return nil, errors.New("接收信息不能为空")
	}

	uniqueKey := ""
	if req.UniqueKey != nil {
		uniqueKey = strings.TrimSpace(*req.UniqueKey)
	}
	if uniqueKey == "" {
		uniqueKey = common.GetUUID()
	}

	subj := &model.InvoiceSubject{
		UniqueKey:         uniqueKey,
		TitleType:         tt,
		TitleName:         strings.TrimSpace(req.TitleName),
		TaxNo:             req.TaxNo,
		RegisteredAddress: req.RegisteredAddress,
		RegisteredPhone:   req.RegisteredPhone,
		BankName:          req.BankName,
		BankAccount:       req.BankAccount,
		ReceiveMethod:     method,
		ReceiveInfo:       strings.TrimSpace(req.ReceiveInfo),
		UserID:            userID,
	}

	if err := tx.Create(subj).Error; err != nil {
		return nil, err
	}
	return subj, nil
}
