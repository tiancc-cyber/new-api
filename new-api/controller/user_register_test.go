package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type registerAPIResponse struct {
	Success bool             `json:"success"`
	Message string           `json:"message"`
	Data    registerUserData `json:"data"`
}

type registerUserData struct {
	ID          int    `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Role        int    `json:"role"`
	Status      int    `json:"status"`
	Group       string `json:"group"`
}

func setupRegisterControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.EmailVerificationEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite db: %v", err)
	}
	model.DB = db
	model.LOG_DB = db

	if err := db.AutoMigrate(&model.User{}, &model.Token{}, &model.Log{}); err != nil {
		t.Fatalf("failed to migrate register schema: %v", err)
	}

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func TestRegisterLogsInAndReturnsUserData(t *testing.T) {
	setupRegisterControllerTestDB(t)

	oldInvitee := common.QuotaForInvitee
	oldInviter := common.QuotaForInviter
	common.QuotaForInvitee = 0
	common.QuotaForInviter = 0
	defer func() {
		common.QuotaForInvitee = oldInvitee
		common.QuotaForInviter = oldInviter
	}()

	payload, err := common.Marshal(map[string]any{
		"username": "new-user",
		"password": "password123",
	})
	if err != nil {
		t.Fatalf("failed to marshal register payload: %v", err)
	}

	recorder := httptest.NewRecorder()
	router := gin.New()
	store := cookie.NewStore([]byte("test-secret"))
	router.Use(sessions.Sessions("test-session", store))
	router.POST("/api/user/register", Register)

	request := httptest.NewRequest(http.MethodPost, "/api/user/register", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", recorder.Code, recorder.Body.String())
	}

	var response registerAPIResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !response.Success {
		t.Fatalf("expected success response, got message: %s", response.Message)
	}
	if response.Data.ID == 0 {
		t.Fatalf("expected user id in response, got %+v", response.Data)
	}
	if response.Data.Username != "new-user" {
		t.Fatalf("expected username new-user, got %q", response.Data.Username)
	}
	if response.Data.DisplayName != "new-user" {
		t.Fatalf("expected display name new-user, got %q", response.Data.DisplayName)
	}
	if response.Data.Group != "default" {
		t.Fatalf("expected default group, got %q", response.Data.Group)
	}
	if response.Data.Role != common.RoleCommonUser {
		t.Fatalf("expected common role %d, got %d", common.RoleCommonUser, response.Data.Role)
	}
	if response.Data.Status != common.UserStatusEnabled {
		t.Fatalf("expected enabled status %d, got %d", common.UserStatusEnabled, response.Data.Status)
	}

	cookies := recorder.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatalf("expected session cookie to be set")
	}

	var createdUser model.User
	if err := model.DB.Where("username = ?", "new-user").First(&createdUser).Error; err != nil {
		t.Fatalf("failed to load created user: %v", err)
	}
	expectedQuota := int(0.2 * common.QuotaPerUnit)
	if createdUser.Quota != expectedQuota {
		t.Fatalf("expected created user quota %d, got %d", expectedQuota, createdUser.Quota)
	}

	var tokenCount int64
	if err := model.DB.Model(&model.Token{}).Where("user_id = ?", createdUser.Id).Count(&tokenCount).Error; err != nil {
		t.Fatalf("failed to count tokens: %v", err)
	}
	if tokenCount != 1 {
		t.Fatalf("expected one initial token, got %d", tokenCount)
	}
}
