package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func AdminListBlogManages(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))

	var statusPtr *int
	if s := c.Query("status"); s != "" {
		if v, err := strconv.Atoi(s); err == nil {
			statusPtr = &v
		}
	}

	items, total, err := service.AdminListBlogManages(service.AdminBlogManageListParams{
		Page:     page,
		PageSize: pageSize,
		Status:   statusPtr,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": items,
		"total": total,
	})
}

func AdminGetBlogManage(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiErrorMsg(c, "invalid id")
		return
	}
	row, err := service.AdminGetBlogManage(uint(id64))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminCreateBlogManage(c *gin.Context) {
	var req dto.AdminBlogManageUpsertRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.AdminCreateBlogManage(req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminUpdateBlogManage(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiErrorMsg(c, "invalid id")
		return
	}
	var req dto.AdminBlogManageUpsertRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.AdminUpdateBlogManage(uint(id64), req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminUpdateBlogManageStatus(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiErrorMsg(c, "invalid id")
		return
	}
	var req dto.AdminBlogManageStatusRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.AdminUpdateBlogManageStatus(uint(id64), req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminDeleteBlogManage(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiErrorMsg(c, "invalid id")
		return
	}
	if err := service.AdminDeleteBlogManage(uint(id64)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, true)
}
