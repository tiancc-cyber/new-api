package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	registrationGiftUSD            = 0.2
	registrationGiftLogContent     = "新用户注册赠送 ＄0.2000 额度"
	registrationInitialTokenGroup  = "auto"
	registrationInitialTokenSuffix = "的初始令牌"
)

func GenerateAutoUsername(prefix string) (string, error) {
	prefix = strings.ToLower(strings.TrimSpace(prefix))
	if prefix == "" {
		prefix = "user"
	}
	if len(prefix) > 8 {
		prefix = prefix[:8]
	}
	for i := 0; i < 10; i++ {
		candidate := prefix + "_" + strings.ToLower(common.GetRandomString(8))
		if len(candidate) > UserNameMaxLength {
			candidate = candidate[:UserNameMaxLength]
		}
		exists, err := CheckUserExistOrDeleted(candidate, "")
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}
	return "", errors.New("无法生成唯一用户名")
}

func getRegistrationGiftQuota() int {
	return int(decimal.NewFromFloat(registrationGiftUSD).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart())
}

func buildRegistrationInitialToken(user *User) (*Token, error) {
	if user == nil || user.Id == 0 {
		return nil, errors.New("user id is empty")
	}
	key, err := common.GenerateKey()
	if err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	giftQuota := getRegistrationGiftQuota()
	return &Token{
		UserId:             user.Id,
		Key:                key,
		Status:             common.TokenStatusEnabled,
		Name:               user.Username + registrationInitialTokenSuffix,
		CreatedTime:        now,
		AccessedTime:       now,
		ExpiredTime:        -1,
		RemainQuota:        giftQuota,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: false,
		Group:              registrationInitialTokenGroup,
	}, nil
}

func ApplyRegisteredUserOnboardingTx(tx *gorm.DB, user *User, inviterId int) error {
	if tx == nil {
		return errors.New("transaction is required")
	}
	if user == nil || user.Id == 0 {
		return errors.New("user id is empty")
	}

	giftQuota := getRegistrationGiftQuota()
	if err := tx.Model(&User{}).Where("id = ?", user.Id).Update("quota", giftQuota).Error; err != nil {
		return err
	}

	token, err := buildRegistrationInitialToken(user)
	if err != nil {
		return err
	}
	if err = tx.Create(token).Error; err != nil {
		return err
	}

	if inviterId != 0 {
		if common.QuotaForInvitee > 0 {
			if err = tx.Model(&User{}).Where("id = ?", user.Id).Update("quota", gorm.Expr("quota + ?", common.QuotaForInvitee)).Error; err != nil {
				return err
			}
		}
		if common.QuotaForInviter > 0 {
			if err = tx.Model(&User{}).Where("id = ?", inviterId).Updates(map[string]any{
				"aff_count":   gorm.Expr("aff_count + ?", 1),
				"aff_quota":   gorm.Expr("aff_quota + ?", common.QuotaForInviter),
				"aff_history": gorm.Expr("aff_history + ?", common.QuotaForInviter),
			}).Error; err != nil {
				return err
			}
		}
	}

	return nil
}

func FinalizeRegisteredUserOnboarding(userId int, inviterId int) error {
	user, err := GetUserById(userId, true)
	if err != nil {
		return err
	}
	if err = updateUserCache(*user); err != nil {
		common.SysLog("failed to update user cache after registration onboarding: " + err.Error())
	}

	RecordLog(userId, LogTypeSystem, registrationGiftLogContent)
	if inviterId != 0 {
		if common.QuotaForInvitee > 0 {
			RecordLog(userId, LogTypeSystem, fmt.Sprintf("使用邀请码赠送 %s", logger.LogQuota(common.QuotaForInvitee)))
		}
		if common.QuotaForInviter > 0 {
			RecordLog(inviterId, LogTypeSystem, fmt.Sprintf("邀请用户赠送 %s", logger.LogQuota(common.QuotaForInviter)))
		}
	}
	return nil
}

func CompleteRegisteredUserOnboarding(user *User, inviterId int) error {
	if user == nil || user.Id == 0 {
		return errors.New("user id is empty")
	}
	if err := DB.Transaction(func(tx *gorm.DB) error {
		return ApplyRegisteredUserOnboardingTx(tx, user, inviterId)
	}); err != nil {
		return err
	}
	return FinalizeRegisteredUserOnboarding(user.Id, inviterId)
}
