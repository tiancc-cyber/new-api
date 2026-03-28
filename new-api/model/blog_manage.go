package model

import (
	"time"

	"gorm.io/gorm"
)

// BlogManage represents a blog management entry managed from admin settings.
//
// Notes:
// - Content is stored as TEXT and can be Markdown or HTML.
// - Cross-DB compatible for SQLite/MySQL/PostgreSQL.
// - The underlying table name is explicitly locked to avoid GORM pluralization surprises.
//
// Table: blog_manages
//
// Required fields for product:
// - published_at (time)
// - tags (comma separated)
// - title
// - image_url
// - intro
// - content (markdown/html)
// - content_type
//
// This model replaced the previous BlogAnnouncement model.
// A migration in model/main.go renames the old table blog_announcements -> blog_manages.
//
// IMPORTANT: Do not use DB-specific column types; keep all fields compatible with SQLite/MySQL/PostgreSQL.
//
//lint:ignore U1000 used by GORM
type BlogManage struct {
	ID uint `gorm:"primaryKey" json:"id"`

	MD5 string `gorm:"type:char(32);uniqueIndex" json:"md5"`

	Title       string `gorm:"type:varchar(512)" json:"title"`
	ImageURL    string `gorm:"type:varchar(2048)" json:"image_url"`
	Intro       string `gorm:"type:text" json:"intro"`
	Tags        string `gorm:"type:text" json:"tags"` // comma-separated
	Content     string `gorm:"type:text" json:"content"`
	ContentType string `gorm:"type:varchar(16);index" json:"content_type"` // markdown/html

	Status      int   `gorm:"index" json:"status"` // 0=draft, 1=published
	Pinned      bool  `gorm:"index" json:"pinned"`
	PublishedAt int64 `gorm:"index" json:"published_at"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (BlogManage) TableName() string {
	return "blog_manages"
}
