package model

// GetInvoiceIDByTopUpIDs 批量查询 topup_id -> invoice_id。
//
// 用途：在 TopUp 列表中展示/禁用“已开票”状态，避免 N+1 查询。
func GetInvoiceIDByTopUpIDs(topupIDs []int) (map[int]uint, error) {
	res := make(map[int]uint)
	if len(topupIDs) == 0 {
		return res, nil
	}

	// 备注：一个 topup 只允许关联到一个 invoice（由创建逻辑保证）。
	type row struct {
		InvoiceID uint
		TopUpID   int
	}
	var rows []row
	if err := DB.Model(&InvoiceTopUp{}).
		Select("invoice_id, top_up_id").
		Where("top_up_id IN ?", topupIDs).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		res[r.TopUpID] = r.InvoiceID
	}
	return res, nil
}
