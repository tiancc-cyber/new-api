package model

import (
	"time"

	"gorm.io/gorm"
)

// InvoiceSubject 发票主体（抬头）信息
//
// 说明：
// - 使用 TEXT/varchar 等跨库类型，兼容 SQLite/MySQL/PostgreSQL
// - UniqueKey 为业务唯一标识，并用于与 Invoice 表关联
//
//lint:ignore U1000 used by GORM
type InvoiceSubject struct {
	ID uint `gorm:"primaryKey" json:"id"`

	// 归属用户
	UserID int `gorm:"index;not null" json:"user_id"`

	// 业务唯一标识（用于对外引用/关联，不建议使用自增 ID 暴露给前端）
	UniqueKey string `gorm:"type:varchar(64);not null;uniqueIndex" json:"unique_key"`

	// 抬头信息
	// TitleType: "个人"/"单位"，用于创建发票时按抬头类型筛选主体。
	TitleType string  `gorm:"type:varchar(32);not null;default:'单位'" json:"title_type"`
	TitleName string  `gorm:"type:varchar(256);not null" json:"title_name"`
	TaxNo     *string `gorm:"type:varchar(64)" json:"tax_no,omitempty"` // 单位税号（个人可为空）

	RegisteredAddress *string `gorm:"type:varchar(512)" json:"registered_address,omitempty"`
	RegisteredPhone   *string `gorm:"type:varchar(64)" json:"registered_phone,omitempty"`
	BankName          *string `gorm:"type:varchar(256)" json:"bank_name,omitempty"`
	BankAccount       *string `gorm:"type:varchar(128)" json:"bank_account,omitempty"`

	// 接收方式（电话/邮箱）
	ReceiveMethod string `gorm:"type:varchar(32);not null;default:'email'" json:"receive_method"`
	ReceiveInfo   string `gorm:"type:varchar(256);not null;default:''" json:"receive_info"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (InvoiceSubject) TableName() string {
	return "invoice_subjects"
}
