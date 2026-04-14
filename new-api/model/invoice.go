package model

import (
	"time"

	"gorm.io/gorm"
)

// Invoice 发票信息
//
// 字段约束：
// - InvoiceType: 例如 "电子普通发票"
// - InvoiceContent: 例如 "商品明细"/"商品类别"
// - TitleType: "个人"/"单位"
// - SubjectUniqueKey: 通过 InvoiceSubject.UniqueKey 进行关联（业务唯一标识）
//
//lint:ignore U1000 used by GORM
type Invoice struct {
	ID uint `gorm:"primaryKey" json:"id"`

	// 归属用户
	UserID int `gorm:"index;not null" json:"user_id"`

	InvoiceType    string `gorm:"type:varchar(64);not null" json:"invoice_type"`
	InvoiceContent string `gorm:"type:varchar(64);not null" json:"invoice_content"`
	TitleType      string `gorm:"type:varchar(32);not null" json:"title_type"`

	// 开票任务状态（异步工单式处理）
	// - pending: 等待开票（进入后台任务队列，需人工处理）
	// - invoiced: 已开票
	// - error: 开票错误（包含错误信息）
	Status string `gorm:"type:varchar(32);not null;default:'pending';index" json:"status"`
	// 错误信息（仅 status=error 时有值）
	ErrorMessage *string `gorm:"type:text" json:"error_message,omitempty"`

	// ------------------------------
	// 发票主体快照（推荐使用）：创建发票时将主体信息固化到发票中。
	// - 跨 DB 兼容：使用 TEXT 保存 JSON
	// - 读取时优先使用 SubjectSnapshot；为空则可回退通过 SubjectUniqueKey 关联查询
	SubjectSnapshot string `gorm:"type:text" json:"subject_snapshot,omitempty"`

	// 关联发票主体（历史兼容）：旧数据/旧逻辑仍可能写入该字段。
	// 新逻辑下该字段可以为空。
	SubjectUniqueKey string          `gorm:"type:varchar(64);index" json:"subject_unique_key,omitempty"`
	Subject          *InvoiceSubject `gorm:"foreignKey:SubjectUniqueKey;references:UniqueKey" json:"subject,omitempty"`

	// 一个发票可以包含多条充值记录（TopUp），通过 join table invoice_topups 关联
	TopUps []TopUp `gorm:"many2many:invoice_topups;joinForeignKey:InvoiceID;joinReferences:TopUpID" json:"topups,omitempty"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Invoice) TableName() string {
	return "invoices"
}
