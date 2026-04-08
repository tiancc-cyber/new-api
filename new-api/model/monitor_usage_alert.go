package model

import "time"

// MonitorUsageAlert records user/token usage monitoring alerts for visualization/auditing.
// Keep it cross-DB compatible (avoid JSONB, use basic types).
type MonitorUsageAlert struct {
	Id int `json:"id"`

	CreatedAt time.Time `json:"created_at" gorm:"index"`

	UserId  int `json:"user_id" gorm:"index"`
	TokenId int `json:"token_id" gorm:"index"`

	// PeriodStart/PeriodEnd define the monitored window (unix seconds).
	PeriodStart int64 `json:"period_start" gorm:"bigint;index"`
	PeriodEnd   int64 `json:"period_end" gorm:"bigint;index"`

	// Metric: "user_quota" or "token_quota".
	Metric string `json:"metric" gorm:"type:varchar(32);index"`

	// UsedQuota is sum(quota) in the window.
	UsedQuota int `json:"used_quota" gorm:"default:0"`
	// ThresholdQuota is the configured threshold that triggered this alert.
	ThresholdQuota int `json:"threshold_quota" gorm:"default:0"`

	// Recipients stores the resolved email recipients at send time.
	Recipients string `json:"recipients" gorm:"type:text"`

	// Status: "sent" | "skipped" | "failed".
	Status string `json:"status" gorm:"type:varchar(16);index"`
	Error  string `json:"error,omitempty" gorm:"type:text"`
}
