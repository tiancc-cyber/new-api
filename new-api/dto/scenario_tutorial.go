package dto

// AdminScenarioTutorialUpsertRequest is used by admin create/update.
//
// Note: use pointer types for optional scalars to preserve explicit zero values.
// See project rule: "Preserve Explicit Zero Values".
type AdminScenarioTutorialUpsertRequest struct {
	Slug *string `json:"slug,omitempty"`

	Title *string `json:"title,omitempty"`
	Intro *string `json:"intro,omitempty"`
	Tags  *string `json:"tags,omitempty"`

	Content     *string `json:"content,omitempty"`
	ContentType *string `json:"content_type,omitempty"`

	Status      *int   `json:"status,omitempty"` // 0=draft, 1=published
	Pinned      *bool  `json:"pinned,omitempty"`
	Order       *int   `json:"order,omitempty"`
	PublishedAt *int64 `json:"published_at,omitempty"`
}

type AdminScenarioTutorialStatusRequest struct {
	Status      *int   `json:"status,omitempty"` // 0=draft, 1=published
	PublishedAt *int64 `json:"published_at,omitempty"`
}

type AdminScenarioTutorialListResponse struct {
	ID          uint   `json:"id"`
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	Intro       string `json:"intro"`
	Tags        string `json:"tags"`
	ContentType string `json:"content_type"`
	Status      int    `json:"status"`
	Pinned      bool   `json:"pinned"`
	Order       int    `json:"order"`
	PublishedAt int64  `json:"published_at"`

	CreatedAt int64 `json:"created_at"`
	UpdatedAt int64 `json:"updated_at"`
}

// ---- Public tutorial DTOs ----

type PublicScenarioTutorialListItem struct {
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	Intro       string `json:"intro"`
	Tags        string `json:"tags"`
	ContentType string `json:"content_type"`
	PublishedAt int64  `json:"published_at"`
}

type PublicScenarioTutorialDetail struct {
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	Intro       string `json:"intro"`
	Tags        string `json:"tags"`
	Content     string `json:"content"`
	ContentType string `json:"content_type"`
	PublishedAt int64  `json:"published_at"`
}
