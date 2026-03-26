package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type UnifiedPasswordAuthRequest struct {
	Username         string `json:"username"`
	Password         string `json:"password"`
	Email            string `json:"email,omitempty"`
	VerificationCode string `json:"verification_code,omitempty"`
	AffCode          string `json:"aff_code,omitempty"`
}

type UnifiedCodeAuthRequest struct {
	Channel     string `json:"channel"`
	Email       string `json:"email,omitempty"`
	CountryCode string `json:"country_code,omitempty"`
	Phone       string `json:"phone,omitempty"`
	Code        string `json:"code"`
	AffCode     string `json:"aff_code,omitempty"`
}

func getInviterIDByAffCode(affCode string) int {
	affCode = strings.TrimSpace(affCode)
	if affCode == "" {
		return 0
	}
	inviterID, _ := model.GetUserIdByAffCode(affCode)
	return inviterID
}

func createRegisteredUserAndLogin(c *gin.Context, cleanUser *model.User, inviterID int) {
	if cleanUser == nil {
		common.ApiError(c, errors.New("用户信息不能为空"))
		return
	}
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := cleanUser.InsertWithTx(tx, inviterID); err != nil {
			return err
		}
		return model.ApplyRegisteredUserOnboardingTx(tx, cleanUser, inviterID)
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.FinalizeRegisteredUserOnboarding(cleanUser.Id, inviterID); err != nil {
		common.ApiErrorI18n(c, i18n.MsgUserRegisterFailed)
		return
	}
	setupLogin(cleanUser, c)
}

func PasswordLoginOrRegister(c *gin.Context) {
	if !common.PasswordLoginEnabled && !common.PasswordRegisterEnabled {
		common.ApiErrorI18n(c, i18n.MsgUserPasswordLoginDisabled)
		return
	}
	var req UnifiedPasswordAuthRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	username := strings.TrimSpace(req.Username)
	password := req.Password
	if username == "" || password == "" {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	loginUser := model.User{Username: username, Password: password}
	if err := loginUser.ValidateAndFill(); err == nil {
		if model.IsTwoFAEnabled(loginUser.Id) {
			session := sessions.Default(c)
			session.Set("pending_username", loginUser.Username)
			session.Set("pending_user_id", loginUser.Id)
			if saveErr := session.Save(); saveErr != nil {
				common.ApiErrorI18n(c, i18n.MsgUserSessionSaveFailed)
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"message": i18n.T(c, i18n.MsgUserRequire2FA),
				"success": true,
				"data": map[string]interface{}{
					"require_2fa": true,
				},
			})
			return
		}
		setupLogin(&loginUser, c)
		return
	}

	exists, err := model.CheckUserExistOrDeleted(username, "")
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	if exists {
		common.ApiError(c, errors.New("用户名或密码错误，或用户已被封禁"))
		return
	}
	if !common.RegisterEnabled {
		common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
		return
	}
	if !common.PasswordRegisterEnabled {
		common.ApiErrorI18n(c, i18n.MsgUserPasswordRegisterDisabled)
		return
	}

	cleanUser := model.User{
		Username:    username,
		Password:    password,
		DisplayName: username,
		Role:        common.RoleCommonUser,
	}
	if common.EmailVerificationEnabled {
		email := strings.TrimSpace(req.Email)
		if email == "" || req.VerificationCode == "" {
			common.ApiErrorI18n(c, i18n.MsgUserEmailVerificationRequired)
			return
		}
		if err = common.Validate.Var(email, "required,email"); err != nil {
			common.ApiErrorI18n(c, i18n.MsgInvalidParams)
			return
		}
		if !common.VerifyCodeWithKey(email, req.VerificationCode, common.EmailVerificationPurpose) {
			common.ApiErrorI18n(c, i18n.MsgUserVerificationCodeError)
			return
		}
		emailExists, checkErr := model.CheckUserExistOrDeleted(cleanUser.Username, email)
		if checkErr != nil {
			common.ApiErrorI18n(c, i18n.MsgDatabaseError)
			return
		}
		if emailExists {
			common.ApiErrorI18n(c, i18n.MsgUserExists)
			return
		}
		cleanUser.Email = email
	}

	createRegisteredUserAndLogin(c, &cleanUser, getInviterIDByAffCode(req.AffCode))
}

func LoginOrRegisterWithCode(c *gin.Context) {
	if !common.RegisterEnabled && !common.IsEmailAuthEnabled() && !common.IsSMSAuthEnabled() {
		common.ApiError(c, errors.New("验证码登录未启用"))
		return
	}
	var req UnifiedCodeAuthRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	channel := strings.ToLower(strings.TrimSpace(req.Channel))
	code := strings.TrimSpace(req.Code)
	if code == "" {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	switch channel {
	case "email":
		handleEmailCodeAuth(c, strings.TrimSpace(req.Email), code, getInviterIDByAffCode(req.AffCode))
	case "sms":
		phone, err := common.NormalizePhoneNumber(req.CountryCode, req.Phone)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		handleSMSCodeAuth(c, phone, code, getInviterIDByAffCode(req.AffCode))
	default:
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
	}
}

func handleEmailCodeAuth(c *gin.Context, email string, code string, inviterID int) {
	if !common.IsEmailAuthEnabled() {
		common.ApiError(c, errors.New("邮箱验证码登录未启用"))
		return
	}
	if err := common.Validate.Var(email, "required,email"); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if !common.VerifyCodeWithKey(email, code, common.EmailAuthPurpose) {
		common.ApiErrorI18n(c, i18n.MsgUserVerificationCodeError)
		return
	}
	common.DeleteKey(email, common.EmailAuthPurpose)

	user := model.User{Email: email}
	if err := user.FillUserByEmail(); err == nil {
		setupLogin(&user, c)
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	if model.IsEmailAlreadyTaken(email) {
		common.ApiError(c, errors.New("该邮箱对应用户不可用"))
		return
	}
	if !common.RegisterEnabled {
		common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
		return
	}
	username, err := model.GenerateAutoUsername("email")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	cleanUser := model.User{
		Username:    username,
		DisplayName: email,
		Email:       email,
		Role:        common.RoleCommonUser,
	}
	createRegisteredUserAndLogin(c, &cleanUser, inviterID)
}

func handleSMSCodeAuth(c *gin.Context, phone string, code string, inviterID int) {
	if !common.IsSMSAuthEnabled() {
		common.ApiError(c, errors.New("短信验证码登录未启用"))
		return
	}
	if !common.VerifyCodeWithKey(phone, code, common.SMSAuthPurpose) {
		common.ApiErrorI18n(c, i18n.MsgUserVerificationCodeError)
		return
	}
	common.DeleteKey(phone, common.SMSAuthPurpose)

	user := model.User{}
	user.SetPhone(phone)
	if err := user.FillUserByPhone(); err == nil {
		setupLogin(&user, c)
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	if model.IsPhoneAlreadyTaken(phone) {
		common.ApiError(c, errors.New("该手机号对应用户不可用"))
		return
	}
	if !common.RegisterEnabled {
		common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
		return
	}
	username, err := model.GenerateAutoUsername("phone")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	cleanUser := model.User{
		Username:    username,
		DisplayName: phone,
		Role:        common.RoleCommonUser,
	}
	cleanUser.SetPhone(phone)
	createRegisteredUserAndLogin(c, &cleanUser, inviterID)
}

func SendSMSVerification(c *gin.Context) {
	if !common.IsSMSAuthEnabled() {
		common.ApiError(c, errors.New("短信验证未启用"))
		return
	}
	phone, err := common.NormalizePhoneNumber(c.Query("country_code"), c.Query("phone"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	code := common.GenerateVerificationCode(6)
	common.RegisterVerificationCodeWithKey(phone, code, common.SMSAuthPurpose)
	if err = common.SendSMS(phone, code); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func SendEmailAuthVerification(c *gin.Context) {
	email := strings.TrimSpace(c.Query("email"))
	if err := common.Validate.Var(email, "required,email"); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	code := common.GenerateVerificationCode(6)
	common.RegisterVerificationCodeWithKey(email, code, common.EmailAuthPurpose)
	subject := fmt.Sprintf("%s登录验证码", common.SystemName)
	content := fmt.Sprintf("<p>您好，你正在进行%s登录/注册验证。</p><p>您的验证码为: <strong>%s</strong></p><p>验证码 %d 分钟内有效，如果不是本人操作，请忽略。</p>", common.SystemName, code, common.VerificationValidMinutes)
	if err := common.SendEmail(subject, email, content); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}
