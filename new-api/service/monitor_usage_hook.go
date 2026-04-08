package service

import "github.com/QuantumNous/new-api/model"

func init() {
	// Wire model -> service hook without creating an import cycle.
	model.OnAfterConsumeLogPersisted = OnUsageConsumed
}
