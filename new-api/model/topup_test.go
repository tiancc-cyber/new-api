package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupTopUpTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite db: %v", err)
	}

	DB = db
	LOG_DB = db

	if err := db.AutoMigrate(&User{}, &TopUp{}, &Token{}, &Log{}, &TokenRequestRecord{}, &TokenRequestRecordChunk{}); err != nil {
		t.Fatalf("failed to migrate test schema: %v", err)
	}

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func seedTopUpTestUser(t *testing.T, db *gorm.DB, id int, username string) *User {
	t.Helper()

	user := &User{
		Id:          id,
		Username:    username,
		Password:    "password123",
		DisplayName: username,
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Quota:       0,
		Group:       "default",
	}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	return user
}

func seedTopUpOrder(t *testing.T, db *gorm.DB, topUp *TopUp) {
	t.Helper()
	if err := db.Create(topUp).Error; err != nil {
		t.Fatalf("failed to create topup order: %v", err)
	}
}

func countUserTokensForTest(t *testing.T, db *gorm.DB, userId int) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&Token{}).Where("user_id = ?", userId).Count(&count).Error; err != nil {
		t.Fatalf("failed to count tokens: %v", err)
	}
	return count
}

func fetchUserForTest(t *testing.T, db *gorm.DB, userId int) *User {
	t.Helper()
	var user User
	if err := db.First(&user, "id = ?", userId).Error; err != nil {
		t.Fatalf("failed to fetch user: %v", err)
	}
	return &user
}

func fetchTopUpForTest(t *testing.T, db *gorm.DB, tradeNo string) *TopUp {
	t.Helper()
	var topUp TopUp
	if err := db.First(&topUp, "trade_no = ?", tradeNo).Error; err != nil {
		t.Fatalf("failed to fetch topup: %v", err)
	}
	return &topUp
}

func countUserTopUpLogsForTest(t *testing.T, db *gorm.DB, userId int) int64 {
	t.Helper()
	var count int64
	if err := db.Model(&Log{}).Where("user_id = ? AND type = ?", userId, LogTypeTopup).Count(&count).Error; err != nil {
		t.Fatalf("failed to count topup logs: %v", err)
	}
	return count
}

func TestRechargeEpayCreditsQuotaWithoutCreatingTokenOrLog(t *testing.T) {
	db := setupTopUpTestDB(t)
	user := seedTopUpTestUser(t, db, 1, "epay-user")
	tradeNo := "epay-order-1"
	seedTopUpOrder(t, db, &TopUp{
		UserId:        user.Id,
		Amount:        3,
		Money:         9.9,
		TradeNo:       tradeNo,
		PaymentMethod: "alipay",
		CreateTime:    1,
		Status:        common.TopUpStatusPending,
	})

	quota, _, err := RechargeEpay(tradeNo)
	if err != nil {
		t.Fatalf("RechargeEpay returned error: %v", err)
	}

	expectedQuota := quotaFromTopUpAmount(3)
	if quota != expectedQuota {
		t.Fatalf("expected quota %d, got %d", expectedQuota, quota)
	}

	updatedUser := fetchUserForTest(t, db, user.Id)
	if updatedUser.Quota != expectedQuota {
		t.Fatalf("expected user quota %d, got %d", expectedQuota, updatedUser.Quota)
	}
	if got := countUserTokensForTest(t, db, user.Id); got != 0 {
		t.Fatalf("expected 0 tokens after topup, got %d", got)
	}

	updatedTopUp := fetchTopUpForTest(t, db, tradeNo)
	if updatedTopUp.Status != common.TopUpStatusSuccess {
		t.Fatalf("expected topup status success, got %s", updatedTopUp.Status)
	}
	if got := countUserTopUpLogsForTest(t, db, user.Id); got != 0 {
		t.Fatalf("expected 0 topup logs after topup, got %d", got)
	}
}

func TestRechargeStripeCreditsQuotaAndStoresCustomerWithoutTokenOrLog(t *testing.T) {
	db := setupTopUpTestDB(t)
	user := seedTopUpTestUser(t, db, 2, "stripe-user")
	tradeNo := "stripe-order-1"
	seedTopUpOrder(t, db, &TopUp{
		UserId:        user.Id,
		Amount:        20,
		Money:         2.5,
		TradeNo:       tradeNo,
		PaymentMethod: "stripe",
		CreateTime:    1,
		Status:        common.TopUpStatusPending,
	})

	if err := Recharge(tradeNo, "cus_test_123"); err != nil {
		t.Fatalf("Recharge returned error: %v", err)
	}

	expectedQuota := quotaFromTopUpMoney(2.5)
	updatedUser := fetchUserForTest(t, db, user.Id)
	if updatedUser.Quota != expectedQuota {
		t.Fatalf("expected user quota %d, got %d", expectedQuota, updatedUser.Quota)
	}
	if updatedUser.StripeCustomer != "cus_test_123" {
		t.Fatalf("expected stripe customer to be updated")
	}
	if got := countUserTokensForTest(t, db, user.Id); got != 0 {
		t.Fatalf("expected 0 tokens after topup, got %d", got)
	}
	if got := countUserTopUpLogsForTest(t, db, user.Id); got != 0 {
		t.Fatalf("expected 0 topup logs after topup, got %d", got)
	}
}

func TestManualCompleteTopUpIsIdempotentWithoutTokenOrLog(t *testing.T) {
	db := setupTopUpTestDB(t)
	user := seedTopUpTestUser(t, db, 3, "manual-user")
	tradeNo := "manual-order-1"
	seedTopUpOrder(t, db, &TopUp{
		UserId:        user.Id,
		Amount:        4,
		Money:         12.8,
		TradeNo:       tradeNo,
		PaymentMethod: "wxpay",
		CreateTime:    1,
		Status:        common.TopUpStatusPending,
	})

	if err := ManualCompleteTopUp(tradeNo); err != nil {
		t.Fatalf("first ManualCompleteTopUp returned error: %v", err)
	}
	if err := ManualCompleteTopUp(tradeNo); err != nil {
		t.Fatalf("second ManualCompleteTopUp returned error: %v", err)
	}

	expectedQuota := quotaFromTopUpAmount(4)
	updatedUser := fetchUserForTest(t, db, user.Id)
	if updatedUser.Quota != expectedQuota {
		t.Fatalf("expected user quota %d after idempotent completion, got %d", expectedQuota, updatedUser.Quota)
	}
	if got := countUserTokensForTest(t, db, user.Id); got != 0 {
		t.Fatalf("expected 0 tokens after repeated completion, got %d", got)
	}
	if got := countUserTopUpLogsForTest(t, db, user.Id); got != 0 {
		t.Fatalf("expected 0 topup logs after repeated completion, got %d", got)
	}
}

func TestRechargeCreemCreditsAmountWithoutTokenOrLog(t *testing.T) {
	db := setupTopUpTestDB(t)
	user := seedTopUpTestUser(t, db, 4, "creem-user")
	tradeNo := "creem-order-1"
	seedTopUpOrder(t, db, &TopUp{
		UserId:        user.Id,
		Amount:        88,
		Money:         19.9,
		TradeNo:       tradeNo,
		PaymentMethod: "creem",
		CreateTime:    1,
		Status:        common.TopUpStatusPending,
	})

	if err := RechargeCreem(tradeNo, "creem@example.com", "Creem User"); err != nil {
		t.Fatalf("RechargeCreem returned error: %v", err)
	}

	updatedUser := fetchUserForTest(t, db, user.Id)
	if updatedUser.Quota != 88 {
		t.Fatalf("expected user quota 88, got %d", updatedUser.Quota)
	}
	if updatedUser.Email != "creem@example.com" {
		t.Fatalf("expected user email to be populated from creem callback")
	}
	if got := countUserTokensForTest(t, db, user.Id); got != 0 {
		t.Fatalf("expected 0 tokens after topup, got %d", got)
	}
	if got := countUserTopUpLogsForTest(t, db, user.Id); got != 0 {
		t.Fatalf("expected 0 topup logs after topup, got %d", got)
	}
}
