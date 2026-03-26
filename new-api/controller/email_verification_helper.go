package controller

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func normalizeAndValidateEmail(email string) (string, error) {
	email = strings.TrimSpace(email)
	if email == "" {
		return "", nil
	}
	if err := common.Validate.Var(email, "required,email"); err != nil {
		return "", errors.New("无效的邮箱地址")
	}
	return email, nil
}

func validateRegistrationEmailRestrictions(email string) error {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return errors.New("无效的邮箱地址")
	}
	localPart := parts[0]
	domainPart := parts[1]

	if common.EmailDomainRestrictionEnabled {
		allowed := false
		for _, domain := range common.EmailDomainWhitelist {
			if domainPart == domain {
				allowed = true
				break
			}
		}
		if !allowed {
			return errors.New("管理员已启用邮箱域名白名单，当前邮箱域名不允许注册")
		}
	}

	if common.EmailAliasRestrictionEnabled {
		containsSpecialSymbols := strings.Contains(localPart, "+") || strings.Contains(localPart, ".")
		if containsSpecialSymbols {
			return errors.New("管理员已启用邮箱地址别名限制，当前邮箱地址不允许注册")
		}
	}

	return nil
}

func validateNewRegistrationEmail(email string) (string, error) {
	email, err := normalizeAndValidateEmail(email)
	if err != nil {
		return "", err
	}
	if err = validateRegistrationEmailRestrictions(email); err != nil {
		return "", err
	}
	if model.IsEmailAlreadyTaken(email) {
		return "", errors.New("邮箱地址已被占用")
	}
	return email, nil
}
