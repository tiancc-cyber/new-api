package controller

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func respondAuthRedirect(c *gin.Context, message string, redirectTo string, payload gin.H) {
	data := gin.H{
		"redirect_to": redirectTo,
	}
	for key, value := range payload {
		data[key] = value
	}
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": message,
		"data":    data,
	})
}
