package model

// InvoiceTopUp 发票与充值账单的关联表
//
// 一个发票（Invoice）可以包含多条充值记录（TopUp）。
// 该表用于建立 invoices <-> top_ups 的多对多关联。
//
// 注意：
// - 字段类型需与主表主键类型一致：Invoice.ID 为 uint，TopUp.Id 为 int
// - 通过复合唯一索引避免重复关联
//
//lint:ignore U1000 used by GORM
type InvoiceTopUp struct {
	InvoiceID uint `gorm:"not null;index;uniqueIndex:uk_invoice_topup,priority:1" json:"invoice_id"`
	TopUpID   int  `gorm:"not null;index;uniqueIndex:uk_invoice_topup,priority:2" json:"topup_id"`
}

func (InvoiceTopUp) TableName() string {
	return "invoice_topups"
}
