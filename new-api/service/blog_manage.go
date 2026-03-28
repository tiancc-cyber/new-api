package service

import (
	"crypto/md5"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

func normalizeContentType(ct string) string {
	ct = strings.ToLower(strings.TrimSpace(ct))
	if ct == "" {
		return "markdown"
	}
	return ct
}

func validateContentType(ct string) error {
	switch ct {
	case "markdown", "html":
		return nil
	default:
		return fmt.Errorf("invalid content_type: %s", ct)
	}
}

func calcBlogMD5(title, content string) string {
	sum := md5.Sum([]byte(title + "\n" + content))
	return fmt.Sprintf("%x", sum)
}

type AdminBlogManageListParams struct {
	Page     int
	PageSize int
	Status   *int
}

func AdminListBlogManages(params AdminBlogManageListParams) (items []dto.AdminBlogManageListResponse, total int64, err error) {
	page := params.Page
	pageSize := params.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}

	db := model.DB.Model(&model.BlogManage{})
	if params.Status != nil {
		db = db.Where("status = ?", *params.Status)
	}
	if err = db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []model.BlogManage
	err = db.Order("pinned desc").Order("published_at desc").Order("id desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&rows).Error
	if err != nil {
		return nil, 0, err
	}

	items = make([]dto.AdminBlogManageListResponse, 0, len(rows))
	for _, r := range rows {
		items = append(items, dto.AdminBlogManageListResponse{
			ID:          r.ID,
			MD5:         r.MD5,
			Title:       r.Title,
			ImageURL:    r.ImageURL,
			Intro:       r.Intro,
			Tags:        r.Tags,
			ContentType: r.ContentType,
			Status:      r.Status,
			Pinned:      r.Pinned,
			PublishedAt: r.PublishedAt,
			CreatedAt:   r.CreatedAt.Unix(),
			UpdatedAt:   r.UpdatedAt.Unix(),
		})
	}
	return items, total, nil
}

func AdminGetBlogManage(id uint) (*model.BlogManage, error) {
	var row model.BlogManage
	if err := model.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func AdminCreateBlogManage(req dto.AdminBlogManageUpsertRequest) (*model.BlogManage, error) {
	if req.Title == nil || strings.TrimSpace(*req.Title) == "" {
		return nil, errors.New("title is required")
	}
	if req.Content == nil {
		return nil, errors.New("content is required")
	}
	contentType := "markdown"
	if req.ContentType != nil {
		contentType = normalizeContentType(*req.ContentType)
	}
	if err := validateContentType(contentType); err != nil {
		return nil, err
	}

	status := 0
	if req.Status != nil {
		status = *req.Status
	}
	publishedAt := int64(0)
	if req.PublishedAt != nil {
		publishedAt = *req.PublishedAt
	}
	if status == 1 && publishedAt == 0 {
		publishedAt = time.Now().Unix()
	}

	md5Str := ""
	if req.MD5 != nil {
		md5Str = strings.TrimSpace(*req.MD5)
	}
	if md5Str == "" {
		md5Str = calcBlogMD5(*req.Title, *req.Content)
	}

	row := &model.BlogManage{
		MD5:         md5Str,
		Title:       strings.TrimSpace(*req.Title),
		ImageURL:    strings.TrimSpace(ptrOrEmpty(req.ImageURL)),
		Intro:       ptrOrEmpty(req.Intro),
		Tags:        ptrOrEmpty(req.Tags),
		Content:     *req.Content,
		ContentType: contentType,
		Status:      status,
		Pinned:      ptrOrFalse(req.Pinned),
		PublishedAt: publishedAt,
	}

	if err := model.DB.Create(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func AdminUpdateBlogManage(id uint, req dto.AdminBlogManageUpsertRequest) (*model.BlogManage, error) {
	var row model.BlogManage
	if err := model.DB.First(&row, id).Error; err != nil {
		return nil, err
	}

	updates := map[string]any{}
	if req.Title != nil {
		updates["title"] = strings.TrimSpace(*req.Title)
	}
	if req.ImageURL != nil {
		updates["image_url"] = strings.TrimSpace(*req.ImageURL)
	}
	if req.Intro != nil {
		updates["intro"] = *req.Intro
	}
	if req.Tags != nil {
		updates["tags"] = *req.Tags
	}
	if req.Content != nil {
		updates["content"] = *req.Content
	}
	if req.ContentType != nil {
		ct := normalizeContentType(*req.ContentType)
		if err := validateContentType(ct); err != nil {
			return nil, err
		}
		updates["content_type"] = ct
	}
	if req.Status != nil {
		updates["status"] = *req.Status
		if *req.Status == 1 {
			if req.PublishedAt != nil {
				updates["published_at"] = *req.PublishedAt
			} else if row.PublishedAt == 0 {
				updates["published_at"] = time.Now().Unix()
			}
		}
	}
	if req.Pinned != nil {
		updates["pinned"] = *req.Pinned
	}
	if req.PublishedAt != nil {
		updates["published_at"] = *req.PublishedAt
	}
	if req.MD5 != nil {
		updates["md5"] = strings.TrimSpace(*req.MD5)
	}

	// auto md5 if title/content changed but md5 not explicitly set
	if updates["md5"] == nil {
		newTitle := row.Title
		newContent := row.Content
		if v, ok := updates["title"].(string); ok {
			newTitle = v
		}
		if v, ok := updates["content"].(string); ok {
			newContent = v
		}
		if (req.Title != nil || req.Content != nil) && newTitle != "" {
			updates["md5"] = calcBlogMD5(newTitle, newContent)
		}
	}

	if len(updates) == 0 {
		return &row, nil
	}
	if err := model.DB.Model(&row).Updates(updates).Error; err != nil {
		return nil, err
	}
	if err := model.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func AdminUpdateBlogManageStatus(id uint, req dto.AdminBlogManageStatusRequest) (*model.BlogManage, error) {
	var row model.BlogManage
	if err := model.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	updates := map[string]any{}
	if req.Status != nil {
		updates["status"] = *req.Status
		if *req.Status == 1 {
			if req.PublishedAt != nil {
				updates["published_at"] = *req.PublishedAt
			} else if row.PublishedAt == 0 {
				updates["published_at"] = time.Now().Unix()
			}
		}
	}
	if req.PublishedAt != nil {
		updates["published_at"] = *req.PublishedAt
	}
	if len(updates) == 0 {
		return &row, nil
	}
	if err := model.DB.Model(&row).Updates(updates).Error; err != nil {
		return nil, err
	}
	if err := model.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func AdminDeleteBlogManage(id uint) error {
	return model.DB.Delete(&model.BlogManage{}, id).Error
}

func ptrOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func ptrOrFalse(b *bool) bool {
	if b == nil {
		return false
	}
	return *b
}
