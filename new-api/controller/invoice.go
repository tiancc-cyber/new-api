package controller

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func ListInvoiceSubjects(c *gin.Context) {
	userID := c.GetInt("id")
	items, err := service.ListInvoiceSubjects(userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items})
}

func CreateInvoiceSubject(c *gin.Context) {
	userID := c.GetInt("id")
	var req dto.InvoiceSubjectUpsertRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.CreateInvoiceSubject(userID, req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func DeleteInvoiceSubject(c *gin.Context) {
	userID := c.GetInt("id")
	uniqueKey := c.Param("unique_key")
	if err := service.DeleteInvoiceSubject(userID, uniqueKey); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, true)
}

func CreateInvoice(c *gin.Context) {
	userID := c.GetInt("id")
	var req dto.InvoiceCreateRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.CreateInvoice(userID, req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func CreateInvoiceWithSubject(c *gin.Context) {
	userID := c.GetInt("id")
	var req dto.InvoiceCreateWithSubjectRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.CreateInvoiceWithSubject(userID, req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func ListInvoices(c *gin.Context) {
	userID := c.GetInt("id")
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	items, total, err := service.ListInvoices(userID, page, pageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total})
}

func adminGetTargetUserID(c *gin.Context) (int, bool) {
	userIDStr := c.Param("id")
	userID, err := strconv.Atoi(userIDStr)
	if err != nil || userID <= 0 {
		common.ApiErrorMsg(c, "invalid user id")
		return 0, false
	}

	targetUser, err := model.GetUserById(userID, false)
	if err != nil {
		common.ApiError(c, err)
		return 0, false
	}

	myRole := c.GetInt("role")
	if myRole <= targetUser.Role && myRole != common.RoleRootUser {
		common.ApiErrorMsg(c, "no permission")
		return 0, false
	}

	return userID, true
}

func AdminListInvoiceSubjects(c *gin.Context) {
	targetUserID, ok := adminGetTargetUserID(c)
	if !ok {
		return
	}
	items, err := service.ListInvoiceSubjects(targetUserID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items})
}

func AdminCreateInvoiceSubject(c *gin.Context) {
	targetUserID, ok := adminGetTargetUserID(c)
	if !ok {
		return
	}
	var req dto.InvoiceSubjectUpsertRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.CreateInvoiceSubject(targetUserID, req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminDeleteInvoiceSubject(c *gin.Context) {
	targetUserID, ok := adminGetTargetUserID(c)
	if !ok {
		return
	}
	uniqueKey := c.Param("unique_key")
	if err := service.DeleteInvoiceSubject(targetUserID, uniqueKey); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, true)
}

func AdminCreateInvoice(c *gin.Context) {
	targetUserID, ok := adminGetTargetUserID(c)
	if !ok {
		return
	}
	var req dto.InvoiceCreateRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.CreateInvoice(targetUserID, req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminCreateInvoiceWithSubject(c *gin.Context) {
	targetUserID, ok := adminGetTargetUserID(c)
	if !ok {
		return
	}
	var req dto.InvoiceCreateWithSubjectRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.CreateInvoiceWithSubject(targetUserID, req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminListInvoices(c *gin.Context) {
	targetUserID, ok := adminGetTargetUserID(c)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	items, total, err := service.ListInvoices(targetUserID, page, pageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total})
}

// ---- Admin: global list (all users) ----

// AdminListAllInvoiceSubjects lists invoice subjects across all users.
// Route: GET /api/invoice/admin/subjects
func AdminListAllInvoiceSubjects(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}

	var total int64
	q := model.DB.Model(&model.InvoiceSubject{})
	if err := q.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var items []*model.InvoiceSubject
	err := q.Order("id desc").Limit(pageSize).Offset((page - 1) * pageSize).Find(&items).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total})
}

// AdminListAllInvoices lists invoices across all users.
// Route: GET /api/invoice/admin/invoices
func AdminListAllInvoices(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	status := strings.ToLower(strings.TrimSpace(c.Query("status")))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}

	var total int64
	q := model.DB.Model(&model.Invoice{})
	if status != "" {
		if status != "pending" && status != "invoiced" && status != "error" {
			common.ApiErrorMsg(c, "invalid status")
			return
		}
		q = q.Where("status = ?", status)
	}
	if err := q.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var items []*model.Invoice
	err := q.Order("id desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Preload("TopUps").
		Preload("Subject").
		Find(&items).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total})
}

type AdminUpdateInvoiceStatusRequest struct {
	Status       string  `json:"status"`
	ErrorMessage *string `json:"error_message"`
}

// AdminUpdateInvoiceStatus updates invoice status for external system backfill.
// Route: PATCH /api/invoice/admin/invoices/:id/status
// Auth: middleware.AdminAuth()
func AdminUpdateInvoiceStatus(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		common.ApiErrorMsg(c, "invalid invoice id")
		return
	}
	var req AdminUpdateInvoiceStatusRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	st := strings.ToLower(strings.TrimSpace(req.Status))
	if st != "pending" && st != "invoiced" && st != "error" {
		common.ApiErrorMsg(c, "invalid status")
		return
	}

	updates := map[string]any{"status": st}
	if st == "error" {
		// error 状态允许写入错误信息；若未传则置空
		updates["error_message"] = req.ErrorMessage
	} else {
		// 其它状态清空 error_message，避免误展示旧错误
		updates["error_message"] = nil
	}

	if err := model.DB.Model(&model.Invoice{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var inv model.Invoice
	_ = model.DB.Preload("TopUps").Preload("Subject").First(&inv, id).Error
	common.ApiSuccess(c, inv)
}

// AdminCreateInvoiceWithSubjectFlat 扁平化管理员代开票接口。
//
// 路由：POST /api/admin/invoice/with_subject
// 权限：middleware.AdminAuth()
func AdminCreateInvoiceWithSubjectFlat(c *gin.Context) {
	var req dto.AdminInvoiceCreateWithSubjectRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if req.UserID <= 0 {
		common.ApiErrorMsg(c, "invalid user id")
		return
	}

	// 复用 admin 代理接口的权限策略：只能操作角色低于自己的用户（root 例外）
	targetUser, err := model.GetUserById(req.UserID, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	myRole := c.GetInt("role")
	if myRole <= targetUser.Role && myRole != common.RoleRootUser {
		common.ApiErrorMsg(c, "no permission")
		return
	}

	row, err := service.AdminCreateInvoiceWithSubject(req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}
