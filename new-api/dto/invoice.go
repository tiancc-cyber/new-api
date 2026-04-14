package dto

// InvoiceSubjectUpsertRequest 发票主体（抬头）创建/更新
// UniqueKey 若为空，后端将自动生成
//
// 说明：该 DTO 不属于 relay 请求，不涉及显式零值保留规则。
type InvoiceSubjectUpsertRequest struct {
	UniqueKey *string `json:"unique_key,omitempty"`

	// TitleType: "个人"/"单位"，不传时后端默认按“单位”处理。
	TitleType string `json:"title_type,omitempty"`

	TitleName string  `json:"title_name"`
	TaxNo     *string `json:"tax_no,omitempty"`

	RegisteredAddress *string `json:"registered_address,omitempty"`
	RegisteredPhone   *string `json:"registered_phone,omitempty"`
	BankName          *string `json:"bank_name,omitempty"`
	BankAccount       *string `json:"bank_account,omitempty"`

	ReceiveMethod string `json:"receive_method"`
	ReceiveInfo   string `json:"receive_info"`
}

type InvoiceCreateRequest struct {
	InvoiceType    string `json:"invoice_type"`
	InvoiceContent string `json:"invoice_content"`
	TitleType      string `json:"title_type"`

	// 主体快照（推荐）：前端直接提交本次开票主体信息，后端固化到发票表。
	// 若同时传 subject_unique_key，后端会优先固化 snapshot，并将 key 作为兼容字段保存。
	SubjectSnapshot *InvoiceSubjectUpsertRequest `json:"subject_snapshot,omitempty"`

	SubjectUniqueKey string `json:"subject_unique_key"`
	TopUpIDs         []int  `json:"topup_ids"`
}

// InvoiceCreateWithSubjectRequest 创建发票（可选：同时创建发票主体）
//
// 约束：subject_unique_key 与 subject 二选一。
//
// 说明：该 DTO 不属于 relay 请求，不涉及显式零值保留规则。
type InvoiceCreateWithSubjectRequest struct {
	InvoiceType    string `json:"invoice_type"`
	InvoiceContent string `json:"invoice_content"`
	TitleType      string `json:"title_type"`

	// 主体快照（推荐）：若提供则直接固化到发票表。
	// 你仍可同时传 subject_unique_key/subject 以维持旧行为，但显示与归档以 snapshot 为准。
	SubjectSnapshot *InvoiceSubjectUpsertRequest `json:"subject_snapshot,omitempty"`

	// 若提供则直接使用已有主体
	SubjectUniqueKey string `json:"subject_unique_key,omitempty"`
	// 若提供则先创建主体，随后用新主体开票
	Subject *InvoiceSubjectUpsertRequest `json:"subject,omitempty"`

	// SubjectUpdate: 当使用已有 subject_unique_key 时，可选传入用于回写更新的字段。
	// 仅当字段非 nil 时才会覆盖写入，避免误把已有值更新为空。
	// 注意：该更新仅影响 invoice_subject 表，用于“本次开票填写时修正主体信息”的场景。
	SubjectUpdate *InvoiceSubjectUpsertRequest `json:"subject_update,omitempty"`

	TopUpIDs []int `json:"topup_ids"`
}

// InvoiceListItem 用于列表（包含主体信息）
type InvoiceListItem struct {
	ID uint `json:"id"`

	InvoiceType    string `json:"invoice_type"`
	InvoiceContent string `json:"invoice_content"`
	TitleType      string `json:"title_type"`

	SubjectUniqueKey string `json:"subject_unique_key"`
	Subject          any    `json:"subject"`

	TopUps any `json:"topups"`

	CreatedAt any `json:"created_at"`
	UpdatedAt any `json:"updated_at"`
}
