package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// ---- Admin ----

func AdminListScenarioTutorials(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))

	var statusPtr *int
	if s := c.Query("status"); s != "" {
		if v, err := strconv.Atoi(s); err == nil {
			statusPtr = &v
		}
	}

	items, total, err := service.AdminListScenarioTutorials(service.AdminScenarioTutorialListParams{
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

func AdminGetScenarioTutorial(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiErrorMsg(c, "invalid id")
		return
	}
	row, err := service.AdminGetScenarioTutorial(uint(id64))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminCreateScenarioTutorial(c *gin.Context) {
	var req dto.AdminScenarioTutorialUpsertRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.AdminCreateScenarioTutorial(req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminUpdateScenarioTutorial(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiErrorMsg(c, "invalid id")
		return
	}
	var req dto.AdminScenarioTutorialUpsertRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.AdminUpdateScenarioTutorial(uint(id64), req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminUpdateScenarioTutorialStatus(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiErrorMsg(c, "invalid id")
		return
	}
	var req dto.AdminScenarioTutorialStatusRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	row, err := service.AdminUpdateScenarioTutorialStatus(uint(id64), req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}

func AdminDeleteScenarioTutorial(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		common.ApiErrorMsg(c, "invalid id")
		return
	}
	if err := service.AdminDeleteScenarioTutorial(uint(id64)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, true)
}

// ---- Public ----

func PublicListScenarioTutorials(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	keyword := c.Query("keyword")

	items, total, err := service.PublicListScenarioTutorials(service.PublicScenarioTutorialListParams{
		Page:     page,
		PageSize: pageSize,
		Keyword:  keyword,
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

func PublicGetScenarioTutorialBySlug(c *gin.Context) {
	slug := c.Param("slug")
	row, err := service.PublicGetScenarioTutorialBySlug(slug)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}
