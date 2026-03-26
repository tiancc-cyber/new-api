package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"gorm.io/gorm"
)

func fetchSystemLogsForTest(t *testing.T, db *gorm.DB, userId int) []*Log {
	t.Helper()
	var logs []*Log
	if err := db.Where("user_id = ? AND type = ?", userId, LogTypeSystem).Order("id asc").Find(&logs).Error; err != nil {
		t.Fatalf("failed to fetch system logs: %v", err)
	}
	return logs
}

func assertLogContentExists(t *testing.T, logs []*Log, expected string) {
	t.Helper()
	for _, logEntry := range logs {
		if logEntry.Content == expected {
			return
		}
	}
	t.Fatalf("expected log content %q, got %+v", expected, logs)
}

func TestRegisteredUserOnboardingCreatesInitialTokenAndGift(t *testing.T) {
	db := setupTopUpTestDB(t)

	oldInvitee := common.QuotaForInvitee
	oldInviter := common.QuotaForInviter
	common.QuotaForInvitee = 0
	common.QuotaForInviter = 0
	defer func() {
		common.QuotaForInvitee = oldInvitee
		common.QuotaForInviter = oldInviter
	}()

	user := &User{
		Username:    "register-user",
		Password:    "password123",
		DisplayName: "register-user",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	if err := db.Transaction(func(tx *gorm.DB) error {
		if err := user.InsertWithTx(tx, 0); err != nil {
			return err
		}
		return ApplyRegisteredUserOnboardingTx(tx, user, 0)
	}); err != nil {
		t.Fatalf("registration transaction returned error: %v", err)
	}
	if err := FinalizeRegisteredUserOnboarding(user.Id, 0); err != nil {
		t.Fatalf("finalize onboarding returned error: %v", err)
	}

	updatedUser := fetchUserForTest(t, db, user.Id)
	expectedQuota := getRegistrationGiftQuota()
	if updatedUser.Quota != expectedQuota {
		t.Fatalf("expected quota %d, got %d", expectedQuota, updatedUser.Quota)
	}
	if updatedUser.Group != "default" {
		t.Fatalf("expected default user group, got %q", updatedUser.Group)
	}
	if updatedUser.GetSetting().SidebarModules == "" {
		t.Fatalf("expected sidebar modules to be initialized")
	}

	if got := countUserTokensForTest(t, db, user.Id); got != 1 {
		t.Fatalf("expected 1 initial token, got %d", got)
	}
	createdToken := fetchSingleUserTokenForTest(t, db, user.Id)
	if createdToken.Name != user.Username+registrationInitialTokenSuffix {
		t.Fatalf("expected token name %q, got %q", user.Username+registrationInitialTokenSuffix, createdToken.Name)
	}
	if createdToken.Group != registrationInitialTokenGroup {
		t.Fatalf("expected token group %q, got %q", registrationInitialTokenGroup, createdToken.Group)
	}
	if createdToken.ExpiredTime != -1 {
		t.Fatalf("expected token never expires, got %d", createdToken.ExpiredTime)
	}
	if !createdToken.UnlimitedQuota {
		t.Fatalf("expected initial token to be unlimited")
	}

	logs := fetchSystemLogsForTest(t, db, user.Id)
	assertLogContentExists(t, logs, registrationGiftLogContent)
}

func TestRegisteredUserOnboardingAppliesInviteRewards(t *testing.T) {
	db := setupTopUpTestDB(t)

	oldInvitee := common.QuotaForInvitee
	oldInviter := common.QuotaForInviter
	common.QuotaForInvitee = 123
	common.QuotaForInviter = 456
	defer func() {
		common.QuotaForInvitee = oldInvitee
		common.QuotaForInviter = oldInviter
	}()

	inviter := seedTopUpTestUser(t, db, 100, "inviter-user")
	invitee := &User{
		Username:    "invitee-user",
		Password:    "password123",
		DisplayName: "invitee-user",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	if err := db.Transaction(func(tx *gorm.DB) error {
		if err := invitee.InsertWithTx(tx, inviter.Id); err != nil {
			return err
		}
		return ApplyRegisteredUserOnboardingTx(tx, invitee, inviter.Id)
	}); err != nil {
		t.Fatalf("registration transaction returned error: %v", err)
	}
	if err := FinalizeRegisteredUserOnboarding(invitee.Id, inviter.Id); err != nil {
		t.Fatalf("finalize onboarding returned error: %v", err)
	}

	updatedInvitee := fetchUserForTest(t, db, invitee.Id)
	expectedInviteeQuota := getRegistrationGiftQuota() + common.QuotaForInvitee
	if updatedInvitee.Quota != expectedInviteeQuota {
		t.Fatalf("expected invitee quota %d, got %d", expectedInviteeQuota, updatedInvitee.Quota)
	}

	updatedInviter := fetchUserForTest(t, db, inviter.Id)
	if updatedInviter.AffCount != 1 {
		t.Fatalf("expected inviter aff_count 1, got %d", updatedInviter.AffCount)
	}
	if updatedInviter.AffQuota != common.QuotaForInviter {
		t.Fatalf("expected inviter aff_quota %d, got %d", common.QuotaForInviter, updatedInviter.AffQuota)
	}
	if updatedInviter.AffHistoryQuota != common.QuotaForInviter {
		t.Fatalf("expected inviter aff_history_quota %d, got %d", common.QuotaForInviter, updatedInviter.AffHistoryQuota)
	}

	inviteeLogs := fetchSystemLogsForTest(t, db, invitee.Id)
	assertLogContentExists(t, inviteeLogs, registrationGiftLogContent)
	assertLogContentExists(t, inviteeLogs, "使用邀请码赠送 "+logger.LogQuota(common.QuotaForInvitee))

	inviterLogs := fetchSystemLogsForTest(t, db, inviter.Id)
	assertLogContentExists(t, inviterLogs, "邀请用户赠送 "+logger.LogQuota(common.QuotaForInviter))
}
