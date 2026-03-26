package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetTokenRequestRecords(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	tokenId, _ := strconv.Atoi(c.Query("token_id"))
	channelId, _ := strconv.Atoi(c.Query("channel_id"))
	statusCode, _ := strconv.Atoi(c.Query("status_code"))

	var isStream *bool
	if raw := c.Query("is_stream"); raw != "" {
		parsed, err := strconv.ParseBool(raw)
		if err == nil {
			isStream = &parsed
		}
	}

	records, total, err := model.GetTokenRequestRecords(model.TokenRequestRecordQuery{
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
		RequestId:      c.Query("request_id"),
		Username:       c.Query("username"),
		TokenName:      c.Query("token_name"),
		ModelName:      c.Query("model_name"),
		OrderNo:        c.Query("order_no"),
		RequestPath:    c.Query("request_path"),
		UserId:         userId,
		TokenId:        tokenId,
		ChannelId:      channelId,
		StatusCode:     statusCode,
		IsStream:       isStream,
	}, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(records)
	common.ApiSuccess(c, pageInfo)
}

func GetTokenRequestRecordDetail(c *gin.Context) {
	recordId, err := strconv.Atoi(c.Param("id"))
	if err != nil || recordId <= 0 {
		common.ApiErrorMsg(c, "无效的审计记录 ID")
		return
	}
	detail, err := model.GetTokenRequestRecordDetail(recordId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, detail)
}
