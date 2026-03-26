package middleware

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

const tokenRequestAuditSpoolFilePattern = "token-request-audit-*.tmp"

func TokenRequestAudit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request == nil {
			c.Next()
			return
		}
		if strings.EqualFold(c.Request.Header.Get("Upgrade"), "websocket") {
			c.Next()
			return
		}

		writer := newTokenRequestAuditResponseWriter(c.Writer)
		c.Writer = writer
		defer writer.Close()

		c.Next()

		if c.GetInt("token_id") <= 0 || c.GetInt("id") <= 0 {
			return
		}

		requestBody := getTokenRequestAuditRequestBody(c)
		responseBody, err := writer.Bytes()
		if err != nil {
			common.SysError(fmt.Sprintf("failed to read token request audit response body: %v", err))
			responseBody = nil
		}

		params := model.RecordTokenRequestRecordParams{
			RequestId:           c.GetString(common.RequestIdKey),
			UserId:              c.GetInt("id"),
			Username:            c.GetString("username"),
			UserEmail:           common.GetContextKeyString(c, constant.ContextKeyUserEmail),
			UserGroup:           common.GetContextKeyString(c, constant.ContextKeyUsingGroup),
			TokenId:             c.GetInt("token_id"),
			TokenName:           c.GetString("token_name"),
			TokenKeyMasked:      model.MaskTokenKey(c.GetString("token_key")),
			RequestMethod:       c.Request.Method,
			RequestPath:         c.Request.URL.RequestURI(),
			ModelName:           common.GetContextKeyString(c, constant.ContextKeyOriginalModel),
			ChannelId:           common.GetContextKeyInt(c, constant.ContextKeyChannelId),
			ChannelName:         common.GetContextKeyString(c, constant.ContextKeyChannelName),
			StatusCode:          c.Writer.Status(),
			IsStream:            isTokenRequestAuditStreamRequest(c),
			RequestContentType:  c.Request.Header.Get("Content-Type"),
			ResponseContentType: c.Writer.Header().Get("Content-Type"),
			RequestBody:         requestBody,
			ResponseBody:        responseBody,
		}
		gopool.Go(func() {
			if err := model.RecordTokenRequestRecord(params); err != nil {
				common.SysError("failed to record token request audit: " + err.Error())
			}
		})
	}
}

func isTokenRequestAuditStreamRequest(c *gin.Context) bool {
	if c == nil || c.Request == nil {
		return false
	}
	if strings.Contains(strings.ToLower(strings.TrimSpace(c.Writer.Header().Get("Content-Type"))), "text/event-stream") {
		return true
	}
	if strings.Contains(strings.ToLower(strings.TrimSpace(c.Request.Header.Get("Accept"))), "text/event-stream") {
		return true
	}
	return false
}

func getTokenRequestAuditRequestBody(c *gin.Context) []byte {
	if c == nil || c.Request == nil {
		return nil
	}
	bodyStorage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil
	}
	data, err := bodyStorage.Bytes()
	if err != nil {
		common.SysError(fmt.Sprintf("failed to read token request audit request body: %v", err))
		return nil
	}
	return append([]byte(nil), data...)
}

type tokenRequestAuditResponseWriter struct {
	gin.ResponseWriter
	spool *tokenRequestAuditSpool
}

func newTokenRequestAuditResponseWriter(writer gin.ResponseWriter) *tokenRequestAuditResponseWriter {
	return &tokenRequestAuditResponseWriter{
		ResponseWriter: writer,
		spool:          newTokenRequestAuditSpool(),
	}
}

func (w *tokenRequestAuditResponseWriter) Write(data []byte) (int, error) {
	if len(data) > 0 {
		if _, err := w.spool.Write(data); err != nil {
			common.SysError(fmt.Sprintf("failed to spool token request audit response body: %v", err))
		}
	}
	return w.ResponseWriter.Write(data)
}

func (w *tokenRequestAuditResponseWriter) WriteString(value string) (int, error) {
	if value != "" {
		if _, err := w.spool.WriteString(value); err != nil {
			common.SysError(fmt.Sprintf("failed to spool token request audit response string: %v", err))
		}
	}
	return w.ResponseWriter.WriteString(value)
}

func (w *tokenRequestAuditResponseWriter) Bytes() ([]byte, error) {
	return w.spool.Bytes()
}

func (w *tokenRequestAuditResponseWriter) Close() {
	_ = w.spool.Close()
}

type tokenRequestAuditSpool struct {
	buffer   bytes.Buffer
	file     *os.File
	filePath string
	size     int64
}

func newTokenRequestAuditSpool() *tokenRequestAuditSpool {
	return &tokenRequestAuditSpool{}
}

func (s *tokenRequestAuditSpool) Write(data []byte) (int, error) {
	if len(data) == 0 {
		return 0, nil
	}
	if s.file == nil && shouldUseTokenRequestAuditSpoolFile(s.size+int64(len(data))) {
		if err := s.switchToFile(); err != nil {
			return 0, err
		}
	}
	var (
		n   int
		err error
	)
	if s.file != nil {
		n, err = s.file.Write(data)
	} else {
		n, err = s.buffer.Write(data)
	}
	s.size += int64(n)
	return n, err
}

func (s *tokenRequestAuditSpool) WriteString(value string) (int, error) {
	return s.Write([]byte(value))
}

func (s *tokenRequestAuditSpool) Bytes() ([]byte, error) {
	if s.file == nil {
		return append([]byte(nil), s.buffer.Bytes()...), nil
	}
	if _, err := s.file.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	data, err := io.ReadAll(s.file)
	if err != nil {
		return nil, err
	}
	_, _ = s.file.Seek(0, io.SeekEnd)
	return data, nil
}

func (s *tokenRequestAuditSpool) Close() error {
	if s.file == nil {
		return nil
	}
	err := s.file.Close()
	removeErr := os.Remove(s.filePath)
	s.file = nil
	s.filePath = ""
	if err != nil {
		return err
	}
	if removeErr != nil && !os.IsNotExist(removeErr) {
		return removeErr
	}
	return nil
}

func (s *tokenRequestAuditSpool) switchToFile() error {
	if s.file != nil {
		return nil
	}
	file, err := createTokenRequestAuditSpoolFile()
	if err != nil {
		return err
	}
	if s.buffer.Len() > 0 {
		if _, err = file.Write(s.buffer.Bytes()); err != nil {
			_ = file.Close()
			_ = os.Remove(file.Name())
			return err
		}
		s.buffer.Reset()
	}
	s.file = file
	s.filePath = file.Name()
	return nil
}

func shouldUseTokenRequestAuditSpoolFile(size int64) bool {
	threshold := common.GetDiskCacheThresholdBytes()
	if threshold <= 0 {
		threshold = 1 << 20
	}
	return size >= threshold
}

func createTokenRequestAuditSpoolFile() (*os.File, error) {
	if err := common.EnsureDiskCacheDir(); err == nil {
		file, fileErr := os.CreateTemp(common.GetDiskCacheDir(), tokenRequestAuditSpoolFilePattern)
		if fileErr == nil {
			return file, nil
		}
	}
	return os.CreateTemp(os.TempDir(), tokenRequestAuditSpoolFilePattern)
}
