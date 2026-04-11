package controller

import (
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ListUsageMonitorAlerts returns recent usage monitor alerts for admin visualization.
// GET /api/monitor/usage/alerts
// Query params:
//   - page (default 1)
//   - page_size (default 20, max 200)
//   - limit (legacy; if provided, overrides page/page_size and returns latest N, max 500)
//   - user_id
//   - username
//   - token_id
//   - metric: user_quota|token_quota
//   - status: sent|failed|skipped
//   - created_start: created_at >= created_start (unix seconds)
//   - created_end: created_at <= created_end (unix seconds)
//   - start: period_start >= start (unix seconds) [window filter]
//   - end: period_end <= end (unix seconds) [window filter]
func ListUsageMonitorAlerts(c *gin.Context) {
	// legacy mode: limit
	limit, _ := strconv.Atoi(c.Query("limit"))
	if limit > 0 {
		if limit > 500 {
			limit = 500
		}
		var alerts []*model.MonitorUsageAlert
		tx := model.DB.Model(&model.MonitorUsageAlert{})
		tx = applyMonitorUsageAlertFilters(c, tx)
		if err := tx.Order("id desc").Limit(limit).Find(&alerts).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		common.ApiSuccess(c, alerts)
		return
	}

	page, _ := strconv.Atoi(c.Query("page"))
	if page <= 0 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}
	offset := (page - 1) * pageSize

	tx := model.DB.Model(&model.MonitorUsageAlert{})
	tx = applyMonitorUsageAlertFilters(c, tx)

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	var alerts []*model.MonitorUsageAlert
	if err := tx.Order("id desc").Offset(offset).Limit(pageSize).Find(&alerts).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"items":     alerts,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func applyMonitorUsageAlertFilters(c *gin.Context, tx *gorm.DB) *gorm.DB {
	// Exact-match filters
	if v := c.Query("user_id"); v != "" {
		if id, err := strconv.Atoi(v); err == nil && id > 0 {
			tx = tx.Where("user_id = ?", id)
		}
	}
	if v := c.Query("username"); v != "" {
		// Case-insensitive match across SQLite/MySQL/PostgreSQL.
		// Default: exact match to ensure admin filtering is deterministic.
		// Optional: username_mode=prefix | contains to relax matching.
		name := strings.TrimSpace(v)
		if name != "" {
			mode := strings.TrimSpace(c.Query("username_mode"))
			s := strings.ToLower(name)
			switch mode {
			case "prefix":
				tx = tx.Where("LOWER(username) LIKE ?", s+"%")
			case "contains":
				tx = tx.Where("LOWER(username) LIKE ?", "%"+s+"%")
			default:
				tx = tx.Where("LOWER(username) = ?", s)
			}
		}
	}
	if v := c.Query("token_id"); v != "" {
		if id, err := strconv.Atoi(v); err == nil {
			// token_id=0 is meaningful for user_quota alerts
			tx = tx.Where("token_id = ?", id)
		}
	}
	if v := c.Query("metric"); v != "" {
		// allow only known metrics
		if v == "user_quota" || v == "user_request_count" {
			tx = tx.Where("metric = ?", v)
		}
	}
	if v := c.Query("status"); v != "" {
		if v == "sent" || v == "failed" || v == "skipped" {
			tx = tx.Where("status = ?", v)
		}
	}

	// Range filters (unix seconds)
	// created_at (time.Time) filters
	if v := c.Query("created_start"); v != "" {
		if ts, err := strconv.ParseInt(v, 10, 64); err == nil && ts > 0 {
			tx = tx.Where("created_at >= ?", time.Unix(ts, 0))
		}
	}
	if v := c.Query("created_end"); v != "" {
		if ts, err := strconv.ParseInt(v, 10, 64); err == nil && ts > 0 {
			tx = tx.Where("created_at <= ?", time.Unix(ts, 0))
		}
	}

	// window (period_start/period_end) filters
	if v := c.Query("start"); v != "" {
		if ts, err := strconv.ParseInt(v, 10, 64); err == nil && ts > 0 {
			tx = tx.Where("period_start >= ?", ts)
		}
	}
	if v := c.Query("end"); v != "" {
		if ts, err := strconv.ParseInt(v, 10, 64); err == nil && ts > 0 {
			tx = tx.Where("period_end <= ?", ts)
		}
	}

	return tx
}
