package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

func newAuthRouter() *gin.Engine {
	router := gin.New()
	store := cookie.NewStore([]byte("test-secret"))
	router.Use(sessions.Sessions("test-session", store))
	router.POST("/api/user/auth/password", PasswordLoginOrRegister)
	router.POST("/api/user/auth/code", LoginOrRegisterWithCode)
	return router
}

func TestPasswordLoginOrRegisterCreatesNewUser(t *testing.T) {
	setupRegisterControllerTestDB(t)
	router := newAuthRouter()

	payload, err := common.Marshal(map[string]any{
		"username": "auth-user",
		"password": "password123",
	})
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/user/auth/password", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)

	var response registerAPIResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !response.Success {
		t.Fatalf("expected success response, got: %s", response.Message)
	}
	if response.Data.Username != "auth-user" {
		t.Fatalf("expected username auth-user, got %q", response.Data.Username)
	}
	if len(recorder.Result().Cookies()) == 0 {
		t.Fatalf("expected session cookie to be set")
	}

	var createdUser model.User
	if err := model.DB.Where("username = ?", "auth-user").First(&createdUser).Error; err != nil {
		t.Fatalf("failed to load created user: %v", err)
	}
	if createdUser.Quota != int(0.2*common.QuotaPerUnit) {
		t.Fatalf("expected onboarding quota, got %d", createdUser.Quota)
	}
}

func TestEmailCodeAuthCreatesNewUser(t *testing.T) {
	setupRegisterControllerTestDB(t)
	common.SMTPServer = "smtp.example.com"
	common.SMTPAccount = "noreply@example.com"
	defer func() {
		common.SMTPServer = ""
		common.SMTPAccount = ""
	}()

	router := newAuthRouter()
	email := "first@example.com"
	code := "123456"
	common.RegisterVerificationCodeWithKey(email, code, common.EmailAuthPurpose)

	payload, err := common.Marshal(map[string]any{
		"channel": "email",
		"email":   email,
		"code":    code,
	})
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/user/auth/code", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)

	var response registerAPIResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !response.Success {
		t.Fatalf("expected success response, got: %s", response.Message)
	}

	var createdUser model.User
	if err := model.DB.Where("email = ?", email).First(&createdUser).Error; err != nil {
		t.Fatalf("failed to load created email user: %v", err)
	}
	if createdUser.Email != email {
		t.Fatalf("expected email %q, got %q", email, createdUser.Email)
	}
}

func TestSMSCodeAuthCreatesNewUser(t *testing.T) {
	setupRegisterControllerTestDB(t)
	common.SMSAuthEnabled = true
	common.SMSWebhookURL = "https://example.com/sms"
	common.SMSDefaultCountryCode = "+86"
	defer func() {
		common.SMSAuthEnabled = false
		common.SMSWebhookURL = ""
		common.SMSDefaultCountryCode = "+86"
	}()

	router := newAuthRouter()
	phone := "+8613800138000"
	code := "654321"
	common.RegisterVerificationCodeWithKey(phone, code, common.SMSAuthPurpose)

	payload, err := common.Marshal(map[string]any{
		"channel":      "sms",
		"country_code": "+86",
		"phone":        "13800138000",
		"code":         code,
	})
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/user/auth/code", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)

	var response registerAPIResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !response.Success {
		t.Fatalf("expected success response, got: %s", response.Message)
	}

	var createdUser model.User
	if err := model.DB.Where("phone = ?", phone).First(&createdUser).Error; err != nil {
		t.Fatalf("failed to load created sms user: %v", err)
	}
	if createdUser.GetPhone() != phone {
		t.Fatalf("expected phone %q, got %q", phone, createdUser.GetPhone())
	}
}
