package controller

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// PublicListBlogs returns published blog list for public pages.
func PublicListBlogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	keyword := strings.TrimSpace(c.Query("keyword"))

	items, total, err := service.PublicListBlogManages(service.PublicBlogManageListParams{
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

// PublicGetBlogByMD5 returns one published blog by MD5.
func PublicGetBlogByMD5(c *gin.Context) {
	md5Str := strings.TrimSpace(c.Param("md5"))
	if md5Str == "" {
		common.ApiErrorMsg(c, "invalid md5")
		return
	}
	row, err := service.PublicGetBlogManageByMD5(md5Str)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, row)
}
