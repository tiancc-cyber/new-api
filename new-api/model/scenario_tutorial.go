package model

import (
	"time"

	"gorm.io/gorm"
)

// ScenarioTutorial represents an admin-managed tutorial for common scenarios.
//
// Notes:
// - Cross-DB compatible for SQLite/MySQL/PostgreSQL.
// - Content is stored as TEXT.
//
// Table: scenario_tutorials
//
//lint:ignore U1000 used by GORM
type ScenarioTutorial struct {
	ID uint `gorm:"primaryKey" json:"id"`

	Slug string `gorm:"type:varchar(128);uniqueIndex" json:"slug"`

	Title string `gorm:"type:varchar(512);index" json:"title"`
	Intro string `gorm:"type:text" json:"intro"`
	Tags  string `gorm:"type:text" json:"tags"`

	Content     string `gorm:"type:text" json:"content"`
	ContentType string `gorm:"type:varchar(16);index" json:"content_type"` // markdown/text

	Status int  `gorm:"index" json:"status"` // 0=draft, 1=published
	Pinned bool `gorm:"index" json:"pinned"`
	Order  int  `gorm:"index" json:"order"`

	PublishedAt int64 `gorm:"index" json:"published_at"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (ScenarioTutorial) TableName() string {
	return "scenario_tutorials"
}
