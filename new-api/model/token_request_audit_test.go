package model

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestRecordTokenRequestRecordStoresChunksAndOrderNo(t *testing.T) {
	db := setupTopUpTestDB(t)
	user := seedTopUpTestUser(t, db, 11, "audit-user")
	tradeNo := "audit-order-12345678"
	seedTopUpOrder(t, db, &TopUp{
		UserId:        user.Id,
		Amount:        10,
		Money:         10,
		TradeNo:       tradeNo,
		PaymentMethod: "alipay",
		CreateTime:    1,
		Status:        "success",
	})

	token, err := CreateRechargeTokenTx(db, user.Id, 100, tradeNo)
	if err != nil {
		t.Fatalf("CreateRechargeTokenTx returned error: %v", err)
	}

	requestBody := []byte(strings.Repeat("你", tokenRequestRecordChunkSize+123))
	responseBody := []byte(strings.Repeat("ok", tokenRequestRecordChunkSize/2))
	if err := RecordTokenRequestRecord(RecordTokenRequestRecordParams{
		RequestId:           "req_audit_1",
		UserId:              user.Id,
		Username:            user.Username,
		UserEmail:           "audit@example.com",
		UserGroup:           user.Group,
		TokenId:             token.Id,
		TokenName:           token.Name,
		TokenKeyMasked:      token.GetMaskedKey(),
		RequestMethod:       "POST",
		RequestPath:         "/v1/chat/completions",
		ModelName:           "gpt-test",
		StatusCode:          200,
		RequestContentType:  "application/json",
		ResponseContentType: "application/json",
		RequestBody:         requestBody,
		ResponseBody:        responseBody,
	}); err != nil {
		t.Fatalf("RecordTokenRequestRecord returned error: %v", err)
	}

	var record TokenRequestRecord
	if err := db.First(&record).Error; err != nil {
		t.Fatalf("failed to fetch record: %v", err)
	}
	if record.OrderNo != tradeNo {
		t.Fatalf("expected order no %q, got %q", tradeNo, record.OrderNo)
	}
	if record.RequestChunkCount != 2 {
		t.Fatalf("expected 2 request chunks, got %d", record.RequestChunkCount)
	}
	if record.ResponseChunkCount != 1 {
		t.Fatalf("expected 1 response chunk, got %d", record.ResponseChunkCount)
	}
	if record.RequestBodyEncoding != "plain" {
		t.Fatalf("expected plain request encoding, got %q", record.RequestBodyEncoding)
	}

	var requestChunks []TokenRequestRecordChunk
	if err := db.Where("record_id = ? AND chunk_type = ?", record.Id, tokenRequestRecordChunkTypeRequest).Order("chunk_index asc").Find(&requestChunks).Error; err != nil {
		t.Fatalf("failed to fetch request chunks: %v", err)
	}
	if len(requestChunks) != 2 {
		t.Fatalf("expected 2 stored request chunks, got %d", len(requestChunks))
	}
	joinedRequest := requestChunks[0].Content + requestChunks[1].Content
	if joinedRequest != string(requestBody) {
		t.Fatalf("stored request content mismatch")
	}
}

func TestRecordTokenRequestRecordStoresBinaryAsBase64(t *testing.T) {
	db := setupTopUpTestDB(t)
	user := seedTopUpTestUser(t, db, 12, "audit-binary-user")
	token, err := CreateRechargeTokenTx(db, user.Id, 100, "binary-order-87654321")
	if err != nil {
		t.Fatalf("CreateRechargeTokenTx returned error: %v", err)
	}

	binaryResponse := []byte{0xff, 0xd8, 0x00, 0x01, 0x02, 0x03}
	if err := RecordTokenRequestRecord(RecordTokenRequestRecordParams{
		RequestId:           "req_audit_2",
		UserId:              user.Id,
		Username:            user.Username,
		UserGroup:           user.Group,
		TokenId:             token.Id,
		TokenName:           token.Name,
		RequestMethod:       "GET",
		RequestPath:         "/v1/files/test",
		StatusCode:          200,
		ResponseContentType: "application/octet-stream",
		ResponseBody:        binaryResponse,
	}); err != nil {
		t.Fatalf("RecordTokenRequestRecord returned error: %v", err)
	}

	var record TokenRequestRecord
	if err := db.Last(&record).Error; err != nil {
		t.Fatalf("failed to fetch record: %v", err)
	}
	if record.ResponseBodyEncoding != "base64" {
		t.Fatalf("expected base64 response encoding, got %q", record.ResponseBodyEncoding)
	}

	var chunks []TokenRequestRecordChunk
	if err := db.Where("record_id = ? AND chunk_type = ?", record.Id, tokenRequestRecordChunkTypeResponse).Order("chunk_index asc").Find(&chunks).Error; err != nil {
		t.Fatalf("failed to fetch response chunks: %v", err)
	}
	if len(chunks) != 1 {
		t.Fatalf("expected 1 response chunk, got %d", len(chunks))
	}
	if chunks[0].Content != base64.StdEncoding.EncodeToString(binaryResponse) {
		t.Fatalf("stored base64 response content mismatch")
	}
}

func TestGetTokenRequestRecordsFiltersByModelName(t *testing.T) {
	db := setupTopUpTestDB(t)
	user := seedTopUpTestUser(t, db, 13, "audit-query-user")
	token, err := CreateRechargeTokenTx(db, user.Id, 100, "query-order-12345678")
	if err != nil {
		t.Fatalf("CreateRechargeTokenTx returned error: %v", err)
	}

	if err := RecordTokenRequestRecord(RecordTokenRequestRecordParams{
		RequestId:     "req_query_1",
		UserId:        user.Id,
		Username:      user.Username,
		UserGroup:     user.Group,
		TokenId:       token.Id,
		TokenName:     token.Name,
		RequestMethod: "POST",
		RequestPath:   "/v1/chat/completions",
		ModelName:     "gpt-4o-mini",
		StatusCode:    200,
		RequestBody:   []byte(`{"hello":"world"}`),
	}); err != nil {
		t.Fatalf("RecordTokenRequestRecord #1 returned error: %v", err)
	}
	if err := RecordTokenRequestRecord(RecordTokenRequestRecordParams{
		RequestId:     "req_query_2",
		UserId:        user.Id,
		Username:      user.Username,
		UserGroup:     user.Group,
		TokenId:       token.Id,
		TokenName:     token.Name,
		RequestMethod: "POST",
		RequestPath:   "/v1/chat/completions",
		ModelName:     "claude-3-5-sonnet",
		StatusCode:    200,
		RequestBody:   []byte(`{"hello":"claude"}`),
	}); err != nil {
		t.Fatalf("RecordTokenRequestRecord #2 returned error: %v", err)
	}

	records, total, err := GetTokenRequestRecords(TokenRequestRecordQuery{
		ModelName: "gpt-%",
	}, 0, 10)
	if err != nil {
		t.Fatalf("GetTokenRequestRecords returned error: %v", err)
	}
	if total != 1 {
		t.Fatalf("expected total 1, got %d", total)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	if records[0].ModelName != "gpt-4o-mini" {
		t.Fatalf("expected model name gpt-4o-mini, got %q", records[0].ModelName)
	}
	if records[0].RequestId != "req_query_1" {
		t.Fatalf("expected request id req_query_1, got %q", records[0].RequestId)
	}
}

func TestGetTokenRequestRecordDetailReturnsChunks(t *testing.T) {
	db := setupTopUpTestDB(t)
	user := seedTopUpTestUser(t, db, 14, "audit-detail-user")
	token, err := CreateRechargeTokenTx(db, user.Id, 100, "detail-order-12345678")
	if err != nil {
		t.Fatalf("CreateRechargeTokenTx returned error: %v", err)
	}

	requestBody := []byte(strings.Repeat("req", tokenRequestRecordChunkSize/2))
	responseBody := []byte(strings.Repeat("resp", tokenRequestRecordChunkSize/2))
	if err := RecordTokenRequestRecord(RecordTokenRequestRecordParams{
		RequestId:     "req_detail_1",
		UserId:        user.Id,
		Username:      user.Username,
		UserGroup:     user.Group,
		TokenId:       token.Id,
		TokenName:     token.Name,
		RequestMethod: "POST",
		RequestPath:   "/v1/responses",
		ModelName:     "gpt-5",
		StatusCode:    200,
		RequestBody:   requestBody,
		ResponseBody:  responseBody,
	}); err != nil {
		t.Fatalf("RecordTokenRequestRecord returned error: %v", err)
	}

	var record TokenRequestRecord
	if err := db.Last(&record).Error; err != nil {
		t.Fatalf("failed to fetch inserted record: %v", err)
	}

	detail, err := GetTokenRequestRecordDetail(record.Id)
	if err != nil {
		t.Fatalf("GetTokenRequestRecordDetail returned error: %v", err)
	}
	if detail.Record == nil || detail.Record.Id != record.Id {
		t.Fatalf("expected detail record id %d", record.Id)
	}
	if len(detail.RequestChunks) == 0 {
		t.Fatalf("expected request chunks")
	}
	if len(detail.ResponseChunks) == 0 {
		t.Fatalf("expected response chunks")
	}
	if detail.Record.ModelName != "gpt-5" {
		t.Fatalf("expected model name gpt-5, got %q", detail.Record.ModelName)
	}
}
