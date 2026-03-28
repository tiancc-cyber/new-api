package dto

// AdminBlogManageUpsertRequest is used by admin create/update.
//
// Note: use pointer types for optional scalars to preserve explicit zero values.
// See project rule: "Preserve Explicit Zero Values".
type AdminBlogManageUpsertRequest struct {
	MD5 *string `json:"md5,omitempty"`

	Title       *string `json:"title,omitempty"`
	ImageURL    *string `json:"image_url,omitempty"`
	Intro       *string `json:"intro,omitempty"`
	Tags        *string `json:"tags,omitempty"` // comma-separated
	Content     *string `json:"content,omitempty"`
	ContentType *string `json:"content_type,omitempty"` // markdown/html

	Status      *int   `json:"status,omitempty"` // 0=draft, 1=published
	Pinned      *bool  `json:"pinned,omitempty"`
	PublishedAt *int64 `json:"published_at,omitempty"`
}

type AdminBlogManageStatusRequest struct {
	Status      *int   `json:"status,omitempty"` // 0=draft, 1=published
	PublishedAt *int64 `json:"published_at,omitempty"`
}

type AdminBlogManageListResponse struct {
	ID          uint   `json:"id"`
	MD5         string `json:"md5"`
	Title       string `json:"title"`
	ImageURL    string `json:"image_url"`
	Intro       string `json:"intro"`
	Tags        string `json:"tags"`
	ContentType string `json:"content_type"`
	Status      int    `json:"status"`
	Pinned      bool   `json:"pinned"`
	PublishedAt int64  `json:"published_at"`

	CreatedAt int64 `json:"created_at"`
	UpdatedAt int64 `json:"updated_at"`
}

// ---- Public blog DTOs ----

type PublicBlogManageListItem struct {
	MD5         string `json:"md5"`
	Title       string `json:"title"`
	ImageURL    string `json:"image_url"`
	Intro       string `json:"intro"`
	Tags        string `json:"tags"`
	ContentType string `json:"content_type"`
	PublishedAt int64  `json:"published_at"`
}

type PublicBlogManageDetail struct {
	MD5         string `json:"md5"`
	Title       string `json:"title"`
	ImageURL    string `json:"image_url"`
	Intro       string `json:"intro"`
	Tags        string `json:"tags"`
	Content     string `json:"content"`
	ContentType string `json:"content_type"`
	PublishedAt int64  `json:"published_at"`
}
