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

type authRedirectResponse struct {
	Success bool           `json:"success"`
	Message string         `json:"message"`
	Data    map[string]any `json:"data"`
}

func newAuthRouter() *gin.Engine {
	router := gin.New()
	store := cookie.NewStore([]byte("test-secret"))
	router.Use(sessions.Sessions("test-session", store))
	router.GET("/api/verification/auth", SendEmailAuthVerification)
	router.POST("/api/user/auth/password", PasswordLoginOrRegister)
	router.POST("/api/user/auth/code", LoginOrRegisterWithCode)
	return router
}

func TestPasswordRegisterCreatesNewUser(t *testing.T) {
	setupRegisterControllerTestDB(t)
	router := newAuthRouter()

	payload, err := common.Marshal(map[string]any{
		"mode":     "register",
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

func TestPasswordLoginRedirectsMissingUserToRegister(t *testing.T) {
	setupRegisterControllerTestDB(t)
	router := newAuthRouter()

	payload, err := common.Marshal(map[string]any{
		"mode":     "login",
		"username": "missing-user",
		"password": "password123",
	})
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/user/auth/password", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)

	var response authRedirectResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if response.Success {
		t.Fatalf("expected missing user login to fail")
	}
	if response.Data["redirect_to"] != "/register" {
		t.Fatalf("expected redirect to register, got %#v", response.Data)
	}
	if response.Data["prefill_username"] != "missing-user" {
		t.Fatalf("expected missing username to be preserved, got %#v", response.Data)
	}
}

func TestEmailCodeAuthRedirectsMissingEmailToRegister(t *testing.T) {
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
		"mode":    "login",
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

	var response authRedirectResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if response.Success {
		t.Fatalf("expected missing email login to fail")
	}
	if response.Data["redirect_to"] != "/register" {
		t.Fatalf("expected redirect to register, got %#v", response.Data)
	}
	if response.Data["prefill_email"] != email {
		t.Fatalf("expected email to be preserved, got %#v", response.Data)
	}
}

func TestEmailCodeAuthLogsInExistingUser(t *testing.T) {
	setupRegisterControllerTestDB(t)
	common.SMTPServer = "smtp.example.com"
	common.SMTPAccount = "noreply@example.com"
	defer func() {
		common.SMTPServer = ""
		common.SMTPAccount = ""
	}()

	email := "existing@example.com"
	existingUser := model.User{
		Username:    "existing-email-user",
		DisplayName: "existing-email-user",
		Email:       email,
		Role:        common.RoleCommonUser,
	}
	if err := existingUser.Insert(0); err != nil {
		t.Fatalf("failed to create existing email user: %v", err)
	}

	var beforeCount int64
	if err := model.DB.Model(&model.User{}).Count(&beforeCount).Error; err != nil {
		t.Fatalf("failed to count users before auth: %v", err)
	}

	router := newAuthRouter()
	code := "123456"
	common.RegisterVerificationCodeWithKey(email, code, common.EmailAuthPurpose)

	payload, err := common.Marshal(map[string]any{
		"mode":    "login",
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
	if response.Data.Username != existingUser.Username {
		t.Fatalf("expected existing username %q, got %q", existingUser.Username, response.Data.Username)
	}

	var afterCount int64
	if err := model.DB.Model(&model.User{}).Count(&afterCount).Error; err != nil {
		t.Fatalf("failed to count users after auth: %v", err)
	}
	if beforeCount != afterCount {
		t.Fatalf("expected existing email auth to reuse account, user count changed from %d to %d", beforeCount, afterCount)
	}
}

func TestSendEmailAuthVerificationRedirectsMissingEmailToRegister(t *testing.T) {
	setupRegisterControllerTestDB(t)
	common.SMTPServer = "smtp.example.com"
	common.SMTPAccount = "noreply@example.com"
	defer func() {
		common.SMTPServer = ""
		common.SMTPAccount = ""
	}()

	router := newAuthRouter()
	email := "unknown@example.com"
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/verification/auth?email="+email, nil)
	router.ServeHTTP(recorder, request)

	var response authRedirectResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if response.Success {
		t.Fatalf("expected send login code for missing email to fail")
	}
	if response.Data["redirect_to"] != "/register" {
		t.Fatalf("expected redirect to register, got %#v", response.Data)
	}
}

func TestPasswordLoginAllowsExistingUserLoginWithoutEmailVerification(t *testing.T) {
	setupRegisterControllerTestDB(t)
	oldEmailVerificationEnabled := common.EmailVerificationEnabled
	common.EmailVerificationEnabled = true
	defer func() {
		common.EmailVerificationEnabled = oldEmailVerificationEnabled
	}()

	existingUser := model.User{
		Username:    "existing-auth-user",
		Password:    "password123",
		DisplayName: "existing-auth-user",
		Role:        common.RoleCommonUser,
	}
	if err := existingUser.Insert(0); err != nil {
		t.Fatalf("failed to create existing password user: %v", err)
	}

	router := newAuthRouter()
	payload, err := common.Marshal(map[string]any{
		"mode":     "login",
		"username": existingUser.Username,
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
	if response.Data.Username != existingUser.Username {
		t.Fatalf("expected username %q, got %q", existingUser.Username, response.Data.Username)
	}
}

func TestPasswordRegisterRequiresEmailVerificationForNewUser(t *testing.T) {
	setupRegisterControllerTestDB(t)
	oldEmailVerificationEnabled := common.EmailVerificationEnabled
	common.EmailVerificationEnabled = true
	defer func() {
		common.EmailVerificationEnabled = oldEmailVerificationEnabled
	}()

	router := newAuthRouter()

	missingVerificationPayload, err := common.Marshal(map[string]any{
		"mode":     "register",
		"username": "email-verified-user",
		"password": "password123",
	})
	if err != nil {
		t.Fatalf("failed to marshal missing-verification payload: %v", err)
	}

	missingVerificationRecorder := httptest.NewRecorder()
	missingVerificationRequest := httptest.NewRequest(http.MethodPost, "/api/user/auth/password", bytes.NewReader(missingVerificationPayload))
	missingVerificationRequest.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(missingVerificationRecorder, missingVerificationRequest)

	var missingVerificationResponse registerAPIResponse
	if err := common.Unmarshal(missingVerificationRecorder.Body.Bytes(), &missingVerificationResponse); err != nil {
		t.Fatalf("failed to decode missing-verification response: %v", err)
	}
	if missingVerificationResponse.Success {
		t.Fatalf("expected missing email verification to fail")
	}

	email := "email-verified@example.com"
	code := "246810"
	common.RegisterVerificationCodeWithKey(email, code, common.EmailVerificationPurpose)

	verifiedPayload, err := common.Marshal(map[string]any{
		"mode":              "register",
		"username":          "email-verified-user",
		"password":          "password123",
		"email":             email,
		"verification_code": code,
	})
	if err != nil {
		t.Fatalf("failed to marshal verified payload: %v", err)
	}

	verifiedRecorder := httptest.NewRecorder()
	verifiedRequest := httptest.NewRequest(http.MethodPost, "/api/user/auth/password", bytes.NewReader(verifiedPayload))
	verifiedRequest.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(verifiedRecorder, verifiedRequest)

	var verifiedResponse registerAPIResponse
	if err := common.Unmarshal(verifiedRecorder.Body.Bytes(), &verifiedResponse); err != nil {
		t.Fatalf("failed to decode verified response: %v", err)
	}
	if !verifiedResponse.Success {
		t.Fatalf("expected verified registration to succeed, got: %s", verifiedResponse.Message)
	}

	var createdUser model.User
	if err := model.DB.Where("username = ?", "email-verified-user").First(&createdUser).Error; err != nil {
		t.Fatalf("failed to load created password auth user: %v", err)
	}
	if createdUser.Email != email {
		t.Fatalf("expected email %q, got %q", email, createdUser.Email)
	}
}

func TestSMSCodeAuthRedirectsMissingUserToRegister(t *testing.T) {
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
		"mode":         "login",
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

	var response authRedirectResponse
	if err := common.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if response.Success {
		t.Fatalf("expected missing phone login to fail")
	}
	if response.Data["redirect_to"] != "/register" {
		t.Fatalf("expected redirect to register, got %#v", response.Data)
	}
}
