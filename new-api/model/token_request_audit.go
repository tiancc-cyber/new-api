package model

import (
	"encoding/base64"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type TokenRequestRecordQuery struct {
	StartTimestamp int64
	EndTimestamp   int64
	RequestId      string
	Username       string
	TokenName      string
	ModelName      string
	OrderNo        string
	RequestPath    string
	UserId         int
	TokenId        int
	ChannelId      int
	StatusCode     int
	IsStream       *bool
}

type TokenRequestRecordDetail struct {
	Record         *TokenRequestRecord        `json:"record"`
	RequestChunks  []*TokenRequestRecordChunk `json:"request_chunks"`
	ResponseChunks []*TokenRequestRecordChunk `json:"response_chunks"`
}

const (
	tokenRequestRecordChunkTypeRequest  = "request"
	tokenRequestRecordChunkTypeResponse = "response"
	tokenRequestRecordChunkSize         = 60000
)

type TokenRequestRecord struct {
	Id                   int    `json:"id" gorm:"index:idx_token_request_records_created_at_id,priority:2"`
	CreatedAt            int64  `json:"created_at" gorm:"bigint;index:idx_token_request_records_created_at_id,priority:1;index:idx_token_request_records_user_id_created_at,priority:2"`
	RequestId            string `json:"request_id" gorm:"type:varchar(64);index;default:''"`
	UserId               int    `json:"user_id" gorm:"index;index:idx_token_request_records_user_id_created_at,priority:1"`
	Username             string `json:"username" gorm:"type:varchar(64);index;default:''"`
	UserEmail            string `json:"user_email" gorm:"type:varchar(255);default:''"`
	UserGroup            string `json:"user_group" gorm:"type:varchar(64);index;default:''"`
	TokenId              int    `json:"token_id" gorm:"index"`
	TokenName            string `json:"token_name" gorm:"type:varchar(255);index;default:''"`
	TokenKeyMasked       string `json:"token_key_masked" gorm:"type:varchar(64);default:''"`
	OrderNo              string `json:"order_no" gorm:"type:varchar(255);index;default:''"`
	RequestMethod        string `json:"request_method" gorm:"type:varchar(16);default:''"`
	RequestPath          string `json:"request_path" gorm:"type:text"`
	ModelName            string `json:"model_name" gorm:"type:varchar(255);index;default:''"`
	ChannelId            int    `json:"channel_id" gorm:"index"`
	ChannelName          string `json:"channel_name" gorm:"type:varchar(255);default:''"`
	StatusCode           int    `json:"status_code" gorm:"index"`
	IsStream             bool   `json:"is_stream" gorm:"index"`
	RequestContentType   string `json:"request_content_type" gorm:"type:varchar(255);default:''"`
	ResponseContentType  string `json:"response_content_type" gorm:"type:varchar(255);default:''"`
	RequestBodyEncoding  string `json:"request_body_encoding" gorm:"type:varchar(16);default:'plain'"`
	ResponseBodyEncoding string `json:"response_body_encoding" gorm:"type:varchar(16);default:'plain'"`
	RequestBodySize      int64  `json:"request_body_size" gorm:"type:bigint;default:0"`
	ResponseBodySize     int64  `json:"response_body_size" gorm:"type:bigint;default:0"`
	RequestChunkCount    int    `json:"request_chunk_count" gorm:"default:0"`
	ResponseChunkCount   int    `json:"response_chunk_count" gorm:"default:0"`
}

type TokenRequestRecordChunk struct {
	Id         int    `json:"id"`
	RecordId   int    `json:"record_id" gorm:"index:idx_token_request_record_chunks_record_type_chunk,priority:1;index"`
	ChunkType  string `json:"chunk_type" gorm:"type:varchar(16);index:idx_token_request_record_chunks_record_type_chunk,priority:2"`
	ChunkIndex int    `json:"chunk_index" gorm:"index:idx_token_request_record_chunks_record_type_chunk,priority:3"`
	Content    string `json:"content" gorm:"type:text"`
	CharLength int64  `json:"char_length" gorm:"type:bigint;default:0"`
}

type RecordTokenRequestRecordParams struct {
	RequestId           string
	UserId              int
	Username            string
	UserEmail           string
	UserGroup           string
	TokenId             int
	TokenName           string
	TokenKeyMasked      string
	OrderNo             string
	RequestMethod       string
	RequestPath         string
	ModelName           string
	ChannelId           int
	ChannelName         string
	StatusCode          int
	IsStream            bool
	RequestContentType  string
	ResponseContentType string
	RequestBody         []byte
	ResponseBody        []byte
}

func RecordTokenRequestRecord(params RecordTokenRequestRecordParams) error {
	if params.TokenId <= 0 || params.UserId <= 0 {
		return nil
	}
	if params.OrderNo == "" {
		params.OrderNo = ResolveTokenRequestOrderNo(params.TokenId, params.UserId, params.TokenName)
	}

	requestContent, requestEncoding := normalizeTokenRequestRecordContent(params.RequestContentType, params.RequestBody)
	responseContent, responseEncoding := normalizeTokenRequestRecordContent(params.ResponseContentType, params.ResponseBody)

	record := &TokenRequestRecord{
		CreatedAt:            common.GetTimestamp(),
		RequestId:            params.RequestId,
		UserId:               params.UserId,
		Username:             params.Username,
		UserEmail:            params.UserEmail,
		UserGroup:            params.UserGroup,
		TokenId:              params.TokenId,
		TokenName:            params.TokenName,
		TokenKeyMasked:       params.TokenKeyMasked,
		OrderNo:              params.OrderNo,
		RequestMethod:        params.RequestMethod,
		RequestPath:          params.RequestPath,
		ModelName:            params.ModelName,
		ChannelId:            params.ChannelId,
		ChannelName:          params.ChannelName,
		StatusCode:           params.StatusCode,
		IsStream:             params.IsStream,
		RequestContentType:   params.RequestContentType,
		ResponseContentType:  params.ResponseContentType,
		RequestBodyEncoding:  requestEncoding,
		ResponseBodyEncoding: responseEncoding,
		RequestBodySize:      int64(len(params.RequestBody)),
		ResponseBodySize:     int64(len(params.ResponseBody)),
	}

	requestChunks := buildTokenRequestRecordChunks(tokenRequestRecordChunkTypeRequest, requestContent)
	responseChunks := buildTokenRequestRecordChunks(tokenRequestRecordChunkTypeResponse, responseContent)
	record.RequestChunkCount = len(requestChunks)
	record.ResponseChunkCount = len(responseChunks)

	return LOG_DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(record).Error; err != nil {
			return err
		}
		if len(requestChunks) > 0 {
			for i := range requestChunks {
				requestChunks[i].RecordId = record.Id
			}
			if err := tx.Create(&requestChunks).Error; err != nil {
				return err
			}
		}
		if len(responseChunks) > 0 {
			for i := range responseChunks {
				responseChunks[i].RecordId = record.Id
			}
			if err := tx.Create(&responseChunks).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func GetTokenRequestRecords(query TokenRequestRecordQuery, startIdx int, num int) (records []*TokenRequestRecord, total int64, err error) {
	tx := LOG_DB.Model(&TokenRequestRecord{})

	if query.StartTimestamp > 0 {
		tx = tx.Where("created_at >= ?", query.StartTimestamp)
	}
	if query.EndTimestamp > 0 {
		tx = tx.Where("created_at <= ?", query.EndTimestamp)
	}
	if query.UserId > 0 {
		tx = tx.Where("user_id = ?", query.UserId)
	}
	if query.TokenId > 0 {
		tx = tx.Where("token_id = ?", query.TokenId)
	}
	if query.ChannelId > 0 {
		tx = tx.Where("channel_id = ?", query.ChannelId)
	}
	if query.StatusCode > 0 {
		tx = tx.Where("status_code = ?", query.StatusCode)
	}
	if query.IsStream != nil {
		tx = tx.Where("is_stream = ?", *query.IsStream)
	}

	if tx, err = applyTokenRequestRecordLikeFilter(tx, "request_id", query.RequestId); err != nil {
		return nil, 0, err
	}
	if tx, err = applyTokenRequestRecordLikeFilter(tx, "username", query.Username); err != nil {
		return nil, 0, err
	}
	if tx, err = applyTokenRequestRecordLikeFilter(tx, "token_name", query.TokenName); err != nil {
		return nil, 0, err
	}
	if tx, err = applyTokenRequestRecordLikeFilter(tx, "model_name", query.ModelName); err != nil {
		return nil, 0, err
	}
	if tx, err = applyTokenRequestRecordLikeFilter(tx, "order_no", query.OrderNo); err != nil {
		return nil, 0, err
	}
	if tx, err = applyTokenRequestRecordLikeFilter(tx, "request_path", query.RequestPath); err != nil {
		return nil, 0, err
	}

	err = tx.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("id desc").Offset(startIdx).Limit(num).Find(&records).Error
	return records, total, err
}

func GetTokenRequestRecordDetail(recordId int) (*TokenRequestRecordDetail, error) {
	if recordId <= 0 {
		return nil, fmt.Errorf("invalid record id")
	}
	var record TokenRequestRecord
	if err := LOG_DB.First(&record, "id = ?", recordId).Error; err != nil {
		return nil, err
	}
	requestChunks, err := getTokenRequestRecordChunks(recordId, tokenRequestRecordChunkTypeRequest)
	if err != nil {
		return nil, err
	}
	responseChunks, err := getTokenRequestRecordChunks(recordId, tokenRequestRecordChunkTypeResponse)
	if err != nil {
		return nil, err
	}
	return &TokenRequestRecordDetail{
		Record:         &record,
		RequestChunks:  requestChunks,
		ResponseChunks: responseChunks,
	}, nil
}

func getTokenRequestRecordChunks(recordId int, chunkType string) (chunks []*TokenRequestRecordChunk, err error) {
	err = LOG_DB.Where("record_id = ? AND chunk_type = ?", recordId, chunkType).Order("chunk_index asc").Find(&chunks).Error
	return chunks, err
}

func applyTokenRequestRecordLikeFilter(tx *gorm.DB, column string, value string) (*gorm.DB, error) {
	if strings.TrimSpace(value) == "" {
		return tx, nil
	}
	pattern, err := sanitizeLikePattern(value)
	if err != nil {
		return nil, err
	}
	return tx.Where(column+" LIKE ? ESCAPE '!'", pattern), nil
}

func buildTokenRequestRecordChunks(chunkType string, content string) []TokenRequestRecordChunk {
	if content == "" {
		return nil
	}
	runes := []rune(content)
	chunks := make([]TokenRequestRecordChunk, 0, (len(runes)+tokenRequestRecordChunkSize-1)/tokenRequestRecordChunkSize)
	for start, index := 0, 0; start < len(runes); start, index = start+tokenRequestRecordChunkSize, index+1 {
		end := start + tokenRequestRecordChunkSize
		if end > len(runes) {
			end = len(runes)
		}
		chunkContent := string(runes[start:end])
		chunks = append(chunks, TokenRequestRecordChunk{
			ChunkType:  chunkType,
			ChunkIndex: index,
			Content:    chunkContent,
			CharLength: int64(len([]rune(chunkContent))),
		})
	}
	return chunks
}

func normalizeTokenRequestRecordContent(contentType string, data []byte) (string, string) {
	if len(data) == 0 {
		return "", "plain"
	}
	if shouldStoreTokenRequestRecordAsPlain(contentType, data) {
		return string(data), "plain"
	}
	return base64.StdEncoding.EncodeToString(data), "base64"
}

func shouldStoreTokenRequestRecordAsPlain(contentType string, data []byte) bool {
	if !utf8.Valid(data) {
		return false
	}
	lowerType := strings.ToLower(strings.TrimSpace(contentType))
	if lowerType == "" {
		return true
	}
	if strings.HasPrefix(lowerType, "text/") {
		return true
	}
	plainPrefixes := []string{
		"application/json",
		"application/problem+json",
		"application/xml",
		"application/x-www-form-urlencoded",
		"multipart/form-data",
		"text/event-stream",
	}
	for _, prefix := range plainPrefixes {
		if strings.HasPrefix(lowerType, prefix) {
			return true
		}
	}
	return strings.Contains(lowerType, "+json") || strings.Contains(lowerType, "+xml")
}

func ResolveTokenRequestOrderNo(tokenId int, userId int, tokenName string) string {
	if tokenId <= 0 || userId <= 0 {
		return ""
	}
	if tokenName == "" {
		token, err := GetTokenById(tokenId)
		if err != nil || token == nil {
			return ""
		}
		tokenName = token.Name
	}
	marker := extractTokenRequestOrderMarker(tokenName)
	if marker == "" {
		return ""
	}

	if topUpTradeNo := findTopUpTradeNoByMarker(userId, marker); topUpTradeNo != "" {
		return topUpTradeNo
	}
	return ""
}

func extractTokenRequestOrderMarker(tokenName string) string {
	if !strings.HasPrefix(tokenName, rechargeTokenNamePrefix) {
		return ""
	}
	remaining := strings.TrimPrefix(tokenName, rechargeTokenNamePrefix)
	marker := remaining
	if index := strings.Index(marker, "-"); index >= 0 {
		marker = marker[:index]
	}
	return strings.TrimSpace(marker)
}

func findTopUpTradeNoByMarker(userId int, marker string) string {
	if marker == "" {
		return ""
	}
	var topUps []*TopUp
	err := DB.Where("user_id = ?", userId).Order("id desc").Limit(100).Find(&topUps).Error
	if err != nil {
		common.SysError(fmt.Sprintf("failed to query topup orders for token request record: %v", err))
		return ""
	}
	for _, topUp := range topUps {
		if topUp == nil {
			continue
		}
		if buildRechargeTokenOrderMarker(topUp.TradeNo) == marker {
			return topUp.TradeNo
		}
	}
	return ""
}
