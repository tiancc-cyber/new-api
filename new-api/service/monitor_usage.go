package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	monitorUsageSettingKeyEnabled          = "usage_monitor.enabled"
	monitorUsageSettingKeyUserRecipients   = "usage_monitor.recipients"
	monitorUsageSettingKeyUserThreshold    = "usage_monitor.user_quota_threshold"
	monitorUsageSettingKeyUserReqThreshold = "usage_monitor.user_request_threshold"
	monitorUsageSettingKeyCheckIntervalM   = "usage_monitor.check_interval_minutes"

	monitorMetricUserQuota        = "user_quota"
	monitorMetricUserRequestCount = "user_request_count"
)

var usageMonitorStarted = false

// StartUsageMonitorScanner starts a background polling scanner.
// It periodically scans all users' usage within the configured window and triggers user quota alerts.
//
// This is the recommended (lower overhead) mode compared to checking on every consume.
func StartUsageMonitorScanner() {

	StartUsageMonitorScannerWithContext(context.Background())
}

// StartUsageMonitorScannerWithContext starts the scan loop and supports cancellation.
// It uses a time.Ticker rather than manual sleep to reduce drift and align with the project's
// other periodic background loops.
func StartUsageMonitorScannerWithContext(ctx context.Context) {
	// Avoid double start (in case of hot reload/tests)
	if usageMonitorStarted {
		return
	}
	usageMonitorStarted = true

	gopool.Go(func() {
		// initialize with a sensible default; it will be adjusted dynamically
		intervalM := getEffectiveCheckIntervalMinutes()
		ticker := time.NewTicker(time.Duration(intervalM) * time.Minute)
		defer ticker.Stop()

		// Run once on start so admins can observe the scan without waiting a full interval.
		if getOrDefaultBool(common.OptionMap[monitorUsageSettingKeyEnabled], true) {
			common.SysLog("usage_monitor scan")
			scanOnceAndAlertUsers()
			scanOnceAndAlertUsersByRequestCount()
		}

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				enabled := getOrDefaultBool(common.OptionMap[monitorUsageSettingKeyEnabled], true)
				if !enabled {
					continue
				}

				// dynamically adjust interval if config changes
				nextIntervalM := getEffectiveCheckIntervalMinutes()
				if nextIntervalM != intervalM {
					intervalM = nextIntervalM
					ticker.Reset(time.Duration(intervalM) * time.Minute)
				}

				common.SysLog("usage_monitor scan")
				scanOnceAndAlertUsers()
				scanOnceAndAlertUsersByRequestCount()
			}
		}
	})
}

// OnUsageConsumed should be called after a consume log is recorded.
// It writes an alert record (and optionally sends email) when the user's/token's
// usage in the last window exceeds configured thresholds.
func OnUsageConsumed(userId int, tokenId int) {
	// Scan-only mode: do not perform per-consume checks in order to avoid DB load under high QPS.
	_ = userId
	_ = tokenId
}

type userReqCountAggRow struct {
	UserId   int
	Username string
	Used     int
}

func scanOnceAndAlertUsersByRequestCount() {
	intervalM := getEffectiveCheckIntervalMinutes()
	windowM := intervalM

	end := time.Now().Unix()
	start := end - int64(windowM)*60
	periodKeyEnd := bucketPeriodEndByInterval(end, intervalM)

	threshold := getOrDefaultInt(common.OptionMap[monitorUsageSettingKeyUserReqThreshold], -1)
	if threshold < 0 {
		// disabled
		return
	}
	// reuse the default monitor recipients
	recipients := normalizeRecipients(common.OptionMap[monitorUsageSettingKeyUserRecipients])
	alsoNotifyUser := false

	// Aggregate by user for the window. We use count(*) which is cross-DB.
	var rows []userReqCountAggRow
	err := model.LOG_DB.Table("logs").
		Select("user_id, username, count(1) as used").
		Where("type = ? AND created_at >= ? AND created_at <= ?", model.LogTypeConsume, start, end).
		Group("user_id, username").
		Having("count(1) >= ?", threshold).
		Scan(&rows).Error
	if err != nil {
		common.SysError("usage monitor request_count scan query failed: " + err.Error())
		return
	}
	if len(rows) == 0 {
		return
	}

	for _, r := range rows {
		uid := r.UserId
		gopool.Go(func() {
			handleUserRequestCountThreshold(start, end, periodKeyEnd, uid, threshold, recipients, alsoNotifyUser)
		})
	}
}

func handleUserRequestCountThreshold(start, end, periodKeyEnd int64, userId int, threshold int, recipients []string, alsoNotifyUser bool) {
	used, err := sumUserRequestCountInWindow(userId, start, end)
	if err != nil {
		persistAlert(monitorMetricUserRequestCount, userId, "", 0, start, periodKeyEnd, 0, threshold, recipients, "failed", err.Error())
		return
	}
	if used < threshold {
		return
	}

	var cnt int64
	if err := model.DB.Model(&model.MonitorUsageAlert{}).
		Where("metric = ? AND user_id = ? AND token_id = 0 AND period_end = ? AND threshold_quota = ? AND status = ?",
			monitorMetricUserRequestCount, userId, periodKeyEnd, threshold, "sent").Count(&cnt).Error; err != nil {
		common.SysError("usage monitor request_count dedup query failed: " + err.Error())
		return
	}
	if cnt > 0 {
		return
	}

	user, err := model.GetUserById(userId, false)
	if err != nil {
		persistAlert(monitorMetricUserRequestCount, userId, "", 0, start, periodKeyEnd, used, threshold, recipients, "failed", err.Error())
		return
	}

	to := recipients
	if user.Email != "" {
		if len(to) == 0 {
			to = []string{user.Email}
		} else if alsoNotifyUser {
			to = append(to, user.Email)
			to = normalizeRecipients(strings.Join(to, ";"))
		}
	}
	if len(to) == 0 {
		persistAlert(monitorMetricUserRequestCount, userId, user.Username, 0, start, periodKeyEnd, used, threshold, nil, "skipped", "no recipients")
		return
	}

	subject := fmt.Sprintf("%s 使用量监控告警（调用次数）", common.SystemName)
	ctx, _ := findLatestConsumeLogContext(userId, 0, start, end)
	content := buildUsageAlertEmailHTML(monitorMetricUserRequestCount, userId, user.Username, 0, start, periodKeyEnd, used, threshold, ctx)
	if err := common.SendEmail(subject, strings.Join(to, ";"), content); err != nil {
		persistAlert(monitorMetricUserRequestCount, userId, user.Username, 0, start, periodKeyEnd, used, threshold, to, "failed", err.Error())
		return
	}
	persistAlert(monitorMetricUserRequestCount, userId, user.Username, 0, start, periodKeyEnd, used, threshold, to, "sent", "")
}

type userQuotaAggRow struct {
	UserId   int
	Username string
	Used     int
}

func scanOnceAndAlertUsers() {
	intervalM := getEffectiveCheckIntervalMinutes()
	windowM := intervalM

	end := time.Now().Unix()
	start := end - int64(windowM)*60
	periodKeyEnd := bucketPeriodEndByInterval(end, intervalM)

	threshold := getOrDefaultInt(common.OptionMap[monitorUsageSettingKeyUserThreshold], 0)
	// threshold == 0 means "alert on any usage".
	recipients := normalizeRecipients(common.OptionMap[monitorUsageSettingKeyUserRecipients])
	alsoNotifyUser := false

	// Aggregate by user for the window.
	// Note: logs.created_at is unix seconds (int64), so comparisons are simple and cross-DB.
	var rows []userQuotaAggRow
	err := model.LOG_DB.Table("logs").
		Select("user_id, username, coalesce(sum(quota),0) as used").
		Where("type = ? AND created_at >= ? AND created_at <= ?", model.LogTypeConsume, start, end).
		Group("user_id, username").
		Having("coalesce(sum(quota),0) >= ?", threshold).
		Scan(&rows).Error
	if err != nil {
		common.SysError("usage monitor scan query failed: " + err.Error())
		return
	}
	if len(rows) == 0 {
		return
	}

	for _, r := range rows {
		uid := r.UserId
		gopool.Go(func() {
			handleUserThreshold(start, end, periodKeyEnd, uid, threshold, recipients, alsoNotifyUser)
		})
	}
}

func normalizeRecipients(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	raw = strings.ReplaceAll(raw, ",", ";")
	items := strings.Split(raw, ";")
	res := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, it := range items {
		email := strings.TrimSpace(it)
		if email == "" {
			continue
		}
		if _, ok := seen[email]; ok {
			continue
		}
		seen[email] = struct{}{}
		res = append(res, email)
	}
	return res
}

func handleUserThreshold(start, end, periodKeyEnd int64, userId int, threshold int, recipients []string, alsoNotifyUser bool) {
	used, err := sumUserUsedQuotaInWindow(userId, start, end)
	if err != nil {
		persistAlert(monitorMetricUserQuota, userId, "", 0, start, periodKeyEnd, 0, threshold, recipients, "failed", err.Error())
		return
	}
	if used < threshold {
		return
	}

	// Alert de-duplication: only 1 record per (metric,user_id,period_end rounded to interval,threshold) with Status=sent.
	// We use DB query before sending.
	var cnt int64
	if err := model.DB.Model(&model.MonitorUsageAlert{}).
		Where("metric = ? AND user_id = ? AND token_id = 0 AND period_end = ? AND threshold_quota = ? AND status = ?",
			monitorMetricUserQuota, userId, periodKeyEnd, threshold, "sent").Count(&cnt).Error; err != nil {
		common.SysError("usage monitor dedup query failed: " + err.Error())
		return
	}
	if cnt > 0 {
		return
	}

	user, err := model.GetUserById(userId, false)
	if err != nil {
		persistAlert(monitorMetricUserQuota, userId, "", 0, start, periodKeyEnd, used, threshold, recipients, "failed", err.Error())
		return
	}

	to := recipients
	if user.Email != "" {
		if len(to) == 0 {
			// fallback: notify to the user's email if configured.
			to = []string{user.Email}
		} else if alsoNotifyUser {
			// also notify user in addition to admin recipients
			to = append(to, user.Email)
			to = normalizeRecipients(strings.Join(to, ";"))
		}
	}
	if len(to) == 0 {
		persistAlert(monitorMetricUserQuota, userId, user.Username, 0, start, periodKeyEnd, used, threshold, nil, "skipped", "no recipients")
		return
	}

	subject := fmt.Sprintf("%s 使用量监控告警（用户）", common.SystemName)
	ctx, _ := findLatestConsumeLogContext(userId, 0, start, end)
	content := buildUsageAlertEmailHTML(monitorMetricUserQuota, userId, user.Username, 0, start, periodKeyEnd, used, threshold, ctx)

	err = common.SendEmail(subject, strings.Join(to, ";"), content)
	if err != nil {
		persistAlert(monitorMetricUserQuota, userId, user.Username, 0, start, periodKeyEnd, used, threshold, to, "failed", err.Error())
		return
	}
	persistAlert(monitorMetricUserQuota, userId, user.Username, 0, start, periodKeyEnd, used, threshold, to, "sent", "")
}

type latestConsumeLogContext struct {
	ModelName   string
	ChannelId   int
	RequestId   string
	CreatedAt   int64
	Quota       int
	PromptTok   int
	CompleteTok int
}

func findLatestConsumeLogContext(userId int, tokenId int, start, end int64) (*latestConsumeLogContext, error) {
	var log model.Log
	tx := model.LOG_DB.Model(&model.Log{}).
		Where("type = ? AND user_id = ? AND created_at >= ? AND created_at <= ?", model.LogTypeConsume, userId, start, end)
	if tokenId > 0 {
		tx = tx.Where("token_id = ?", tokenId)
	}
	if err := tx.Order("id desc").Limit(1).First(&log).Error; err != nil {
		return nil, err
	}
	return &latestConsumeLogContext{
		ModelName:   log.ModelName,
		ChannelId:   log.ChannelId,
		RequestId:   log.RequestId,
		CreatedAt:   log.CreatedAt,
		Quota:       log.Quota,
		PromptTok:   log.PromptTokens,
		CompleteTok: log.CompletionTokens,
	}, nil
}

func sumUserUsedQuotaInWindow(userId int, start, end int64) (int, error) {
	var used int
	err := model.LOG_DB.Table("logs").Select("coalesce(sum(quota),0)").
		Where("type = ? AND user_id = ? AND created_at >= ? AND created_at <= ?",
			model.LogTypeConsume, userId, start, end).
		Scan(&used).Error
	return used, err
}

func sumUserRequestCountInWindow(userId int, start, end int64) (int, error) {
	var used int
	err := model.LOG_DB.Table("logs").Select("count(1)").
		Where("type = ? AND user_id = ? AND created_at >= ? AND created_at <= ?",
			model.LogTypeConsume, userId, start, end).
		Scan(&used).Error
	return used, err
}

func persistAlert(metric string, userId int, username string, tokenId int, start, end int64, used int, threshold int, recipients []string, status string, errMsg string) {
	if username == "" && userId > 0 {
		// best-effort username lookup for failed paths
		if u, err := model.GetUserById(userId, false); err == nil {
			username = u.Username
		}
	}
	recipientStr := strings.Join(recipients, ";")
	alert := &model.MonitorUsageAlert{
		CreatedAt:      time.Now(),
		UserId:         userId,
		Username:       username,
		TokenId:        tokenId,
		PeriodStart:    start,
		PeriodEnd:      end,
		Metric:         metric,
		UsedQuota:      used,
		ThresholdQuota: threshold,
		Recipients:     recipientStr,
		Status:         status,
		Error:          errMsg,
	}
	if err := model.DB.Create(alert).Error; err != nil {
		common.SysError(fmt.Sprintf("failed to persist usage alert: metric=%s user_id=%d token_id=%d period_end=%d: %v", metric, userId, tokenId, end, err))
		return
	}
	//common.SysLog(fmt.Sprintf("usage_monitor alert persisted: metric=%s user_id=%d token_id=%d used=%d threshold=%d status=%s period_end=%d", metric, userId, tokenId, used, threshold, status, end))
}

func buildUsageAlertEmailHTML(metric string, userId int, username string, tokenId int, start, end int64, used int, threshold int, ctx *latestConsumeLogContext) string {
	metricText := ""
	subjectText := ""
	unitText := "quota"
	if metric == monitorMetricUserQuota {
		metricText = "用户"
		subjectText = fmt.Sprintf("用户 %s", username)
	} else {
		metricText = "用户"
		subjectText = fmt.Sprintf("用户 %s", username)
		unitText = "次"
	}
	ctxHTML := ""
	if ctx != nil {
		ctxHTML = fmt.Sprintf(
			"<hr/>"+
				"<p><strong>最近一次窗口内消费参考</strong></p>"+
				"<p>时间：%s</p>"+
				"<p>模型：%s</p>"+
				"<p>渠道ID：%d</p>"+
				"<p>请求ID：%s</p>"+
				"<p>本次消耗：%d（quota），tokens=%d+%d</p>",
			time.Unix(ctx.CreatedAt, 0).Format("2006-01-02 15:04:05"),
			ctx.ModelName,
			ctx.ChannelId,
			ctx.RequestId,
			ctx.Quota,
			ctx.PromptTok,
			ctx.CompleteTok,
		)
	}
	return fmt.Sprintf(
		"<p>您好，%s使用量监控触发阈值。</p>"+
			"<p>对象：<strong>%s</strong></p>"+
			"<p>用户ID：<strong>%d</strong></p>"+
			"<p>令牌ID：<strong>%d</strong></p>"+
			"<p>时间窗口：%s ~ %s</p>"+
			"<p>使用量：<strong>%d</strong>（%s）</p>"+
			"<p>阈值：<strong>%d</strong>（%s）</p>"+
			"<p>请前往控制台查看详细使用情况。</p>"+
			"%s",
		metricText,
		subjectText,
		userId,
		tokenId,
		time.Unix(start, 0).Format("2006-01-02 15:04:05"),
		time.Unix(end, 0).Format("2006-01-02 15:04:05"),
		used,
		unitText,
		threshold,
		unitText,
		ctxHTML,
	)
}

func getOrDefaultBool(val string, def bool) bool {
	if val == "" {
		return def
	}
	b, err := strconv.ParseBool(val)
	if err != nil {
		return def
	}
	return b
}

func getOrDefaultInt(val string, def int) int {
	if val == "" {
		return def
	}
	i, err := strconv.Atoi(val)
	if err != nil {
		return def
	}
	return i
}

// getEffectiveCheckIntervalMinutes returns the configured usage monitor scan interval.
// It also provides a single place to enforce sane defaults.
func getEffectiveCheckIntervalMinutes() int {
	intervalM := getOrDefaultInt(common.OptionMap[monitorUsageSettingKeyCheckIntervalM], 10)
	if intervalM <= 0 {
		intervalM = 10
	}
	return intervalM
}

// bucketPeriodEndByInterval buckets the period_end key to the scan interval, so de-duplication
// works correctly when interval != 1 minute.
func bucketPeriodEndByInterval(endUnixSec int64, intervalM int) int64 {
	bucketSec := int64(intervalM) * 60
	if bucketSec <= 0 {
		bucketSec = 60
	}
	// Ensure minimum 60s so period_key remains stable and readable.
	if bucketSec < 60 {
		bucketSec = 60
	}
	return endUnixSec - (endUnixSec % bucketSec)
}
