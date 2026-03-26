package common

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type smsWebhookResponse struct {
	Success *bool  `json:"success"`
	Message string `json:"message"`
}

func IsEmailAuthEnabled() bool {
	return SMTPServer != "" && SMTPAccount != ""
}

func IsSMSAuthEnabled() bool {
	return SMSAuthEnabled && SMSWebhookURL != ""
}

func NormalizePhoneNumber(countryCode string, phone string) (string, error) {
	cleanCountryCode := cleanPhoneSegment(countryCode)
	cleanPhone := cleanPhoneSegment(phone)
	if cleanCountryCode == "" {
		cleanCountryCode = cleanPhoneSegment(SMSDefaultCountryCode)
	}
	if cleanCountryCode == "" {
		cleanCountryCode = "+86"
	}
	if !strings.HasPrefix(cleanCountryCode, "+") {
		cleanCountryCode = "+" + cleanCountryCode
	}
	if len(cleanCountryCode) < 2 {
		return "", fmt.Errorf("无效的国家区号")
	}
	if cleanPhone == "" {
		return "", fmt.Errorf("手机号不能为空")
	}
	if len(cleanPhone) < 6 || len(cleanPhone) > 20 {
		return "", fmt.Errorf("无效的手机号")
	}
	return cleanCountryCode + cleanPhone, nil
}

func cleanPhoneSegment(input string) string {
	input = strings.TrimSpace(input)
	builder := strings.Builder{}
	for i, r := range input {
		if r >= '0' && r <= '9' {
			builder.WriteRune(r)
			continue
		}
		if r == '+' && i == 0 {
			builder.WriteRune(r)
		}
	}
	return builder.String()
}

func SendSMS(phone string, code string) error {
	if !IsSMSAuthEnabled() {
		return fmt.Errorf("短信服务未配置")
	}
	payload, err := Marshal(map[string]any{
		"phone":         phone,
		"code":          code,
		"system_name":   SystemName,
		"valid_minutes": VerificationValidMinutes,
		"message":       fmt.Sprintf("【%s】验证码：%s，%d 分钟内有效。", SystemName, code, VerificationValidMinutes),
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, SMSWebhookURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if SMSWebhookAuthorization != "" {
		req.Header.Set("Authorization", SMSWebhookAuthorization)
	}
	client := &http.Client{Timeout: time.Duration(SMSRequestTimeoutSeconds) * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		if strings.TrimSpace(string(body)) == "" {
			return fmt.Errorf("短信发送失败，状态码：%d", resp.StatusCode)
		}
		return fmt.Errorf("短信发送失败：%s", strings.TrimSpace(string(body)))
	}
	var webhookResp smsWebhookResponse
	if err = DecodeJson(resp.Body, &webhookResp); err == nil {
		if webhookResp.Success != nil && !*webhookResp.Success {
			if webhookResp.Message != "" {
				return fmt.Errorf("%s", webhookResp.Message)
			}
			return fmt.Errorf("短信发送失败")
		}
	}
	return nil
}
