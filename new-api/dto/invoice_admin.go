package dto

// AdminInvoiceCreateWithSubjectRequest 管理员代开票请求
//
// 说明：
// - user_id 为发票归属用户（通常来自 topup 的 user_id）。
// - subject_unique_key 与 subject 二选一。
// - 该 DTO 不属于 relay 请求，不涉及显式零值保留规则。
type AdminInvoiceCreateWithSubjectRequest struct {
	UserID int `json:"user_id"`

	InvoiceType    string `json:"invoice_type"`
	InvoiceContent string `json:"invoice_content"`
	TitleType      string `json:"title_type"`

	SubjectUniqueKey string                       `json:"subject_unique_key,omitempty"`
	Subject          *InvoiceSubjectUpsertRequest `json:"subject,omitempty"`

	TopUpIDs []int `json:"topup_ids"`
}
