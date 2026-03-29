package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

func normalizeTutorialContentType(ct string) string {
	ct = strings.ToLower(strings.TrimSpace(ct))
	if ct == "" {
		return "markdown"
	}
	return ct
}

func validateTutorialContentType(ct string) error {
	switch ct {
	case "markdown", "text", "html":
		return nil
	default:
		return fmt.Errorf("invalid content_type: %s", ct)
	}
}

type AdminScenarioTutorialListParams struct {
	Page     int
	PageSize int
	Status   *int
}

type PublicScenarioTutorialListParams struct {
	Page     int
	PageSize int
	Keyword  string
}

func AdminListScenarioTutorials(params AdminScenarioTutorialListParams) (items []dto.AdminScenarioTutorialListResponse, total int64, err error) {
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

	db := model.DB.Model(&model.ScenarioTutorial{})
	if params.Status != nil {
		db = db.Where("status = ?", *params.Status)
	}
	if err = db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []model.ScenarioTutorial
	err = db.Order("pinned desc").Order("`order` desc").Order("published_at desc").Order("id desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&rows).Error
	if err != nil {
		// "order" is a reserved word in some DBs; if quoting fails, fallback to id ordering.
		err = model.DB.Model(&model.ScenarioTutorial{}).
			Order("pinned desc").Order("published_at desc").Order("id desc").
			Limit(pageSize).
			Offset((page - 1) * pageSize).
			Find(&rows).Error
		if err != nil {
			return nil, 0, err
		}
	}

	items = make([]dto.AdminScenarioTutorialListResponse, 0, len(rows))
	for _, r := range rows {
		items = append(items, dto.AdminScenarioTutorialListResponse{
			ID:          r.ID,
			Slug:        r.Slug,
			Title:       r.Title,
			Intro:       r.Intro,
			Tags:        r.Tags,
			ContentType: r.ContentType,
			Status:      r.Status,
			Pinned:      r.Pinned,
			Order:       r.Order,
			PublishedAt: r.PublishedAt,
			CreatedAt:   r.CreatedAt.Unix(),
			UpdatedAt:   r.UpdatedAt.Unix(),
		})
	}
	return items, total, nil
}

func AdminGetScenarioTutorial(id uint) (*model.ScenarioTutorial, error) {
	var row model.ScenarioTutorial
	if err := model.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func AdminCreateScenarioTutorial(req dto.AdminScenarioTutorialUpsertRequest) (*model.ScenarioTutorial, error) {
	if req.Slug == nil || strings.TrimSpace(*req.Slug) == "" {
		return nil, errors.New("slug is required")
	}
	if req.Title == nil || strings.TrimSpace(*req.Title) == "" {
		return nil, errors.New("title is required")
	}
	if req.Content == nil {
		return nil, errors.New("content is required")
	}

	contentType := "markdown"
	if req.ContentType != nil {
		contentType = normalizeTutorialContentType(*req.ContentType)
	}
	if err := validateTutorialContentType(contentType); err != nil {
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

	row := &model.ScenarioTutorial{
		Slug:        strings.TrimSpace(*req.Slug),
		Title:       strings.TrimSpace(*req.Title),
		Intro:       ptrOrEmpty(req.Intro),
		Tags:        ptrOrEmpty(req.Tags),
		Content:     *req.Content,
		ContentType: contentType,
		Status:      status,
		Pinned:      ptrOrFalse(req.Pinned),
		Order:       ptrOrZero(req.Order),
		PublishedAt: publishedAt,
	}

	if err := model.DB.Create(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func AdminUpdateScenarioTutorial(id uint, req dto.AdminScenarioTutorialUpsertRequest) (*model.ScenarioTutorial, error) {
	var row model.ScenarioTutorial
	if err := model.DB.First(&row, id).Error; err != nil {
		return nil, err
	}

	updates := map[string]any{}
	if req.Slug != nil {
		updates["slug"] = strings.TrimSpace(*req.Slug)
	}
	if req.Title != nil {
		updates["title"] = strings.TrimSpace(*req.Title)
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
		ct := normalizeTutorialContentType(*req.ContentType)
		if err := validateTutorialContentType(ct); err != nil {
			return nil, err
		}
		updates["content_type"] = ct
	}
	if req.Pinned != nil {
		updates["pinned"] = *req.Pinned
	}
	if req.Order != nil {
		updates["order"] = *req.Order
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

func AdminUpdateScenarioTutorialStatus(id uint, req dto.AdminScenarioTutorialStatusRequest) (*model.ScenarioTutorial, error) {
	var row model.ScenarioTutorial
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

func AdminDeleteScenarioTutorial(id uint) error {
	return model.DB.Delete(&model.ScenarioTutorial{}, id).Error
}

func PublicListScenarioTutorials(params PublicScenarioTutorialListParams) (items []dto.PublicScenarioTutorialListItem, total int64, err error) {
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

	db := model.DB.Model(&model.ScenarioTutorial{}).Where("status = ?", 1)
	kw := strings.TrimSpace(params.Keyword)
	if kw != "" {
		like := "%" + kw + "%"
		db = db.Where("title LIKE ? OR intro LIKE ? OR tags LIKE ?", like, like, like)
	}
	if err = db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []model.ScenarioTutorial
	err = db.Order("pinned desc").Order("`order` desc").Order("published_at desc").Order("id desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&rows).Error
	if err != nil {
		// fallback without order field
		err = model.DB.Model(&model.ScenarioTutorial{}).Where("status = ?", 1).
			Order("pinned desc").Order("published_at desc").Order("id desc").
			Limit(pageSize).
			Offset((page - 1) * pageSize).
			Find(&rows).Error
		if err != nil {
			return nil, 0, err
		}
	}

	items = make([]dto.PublicScenarioTutorialListItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, dto.PublicScenarioTutorialListItem{
			Slug:        r.Slug,
			Title:       r.Title,
			Intro:       r.Intro,
			Tags:        r.Tags,
			ContentType: r.ContentType,
			PublishedAt: r.PublishedAt,
		})
	}
	return items, total, nil
}

func PublicGetScenarioTutorialBySlug(slug string) (*dto.PublicScenarioTutorialDetail, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil, errors.New("invalid slug")
	}
	var row model.ScenarioTutorial
	if err := model.DB.Where("slug = ?", slug).Where("status = ?", 1).First(&row).Error; err != nil {
		return nil, err
	}
	return &dto.PublicScenarioTutorialDetail{
		Slug:        row.Slug,
		Title:       row.Title,
		Intro:       row.Intro,
		Tags:        row.Tags,
		Content:     row.Content,
		ContentType: row.ContentType,
		PublishedAt: row.PublishedAt,
	}, nil
}

func ptrOrZero[T ~int](p *T) int {
	if p == nil {
		return 0
	}
	return int(*p)
}
