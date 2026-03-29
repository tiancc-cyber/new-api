/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { useTableCompactMode } from '../common/useTableCompactMode';

export const useScenarioTutorialsData = () => {
  const { t } = useTranslation();

  const [compactMode, setCompactMode] = useTableCompactMode('scenario_tutorials');

  const [allRows, setAllRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showEdit, setShowEdit] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [sheetPlacement, setSheetPlacement] = useState('left');

  const loadRows = async () => {
	setLoading(true);
	try {
	  const res = await API.get('/api/scenario_tutorial/admin/tutorials', {
		params: {
		  page: activePage,
		  page_size: pageSize,
		},
	  });
	  if (res.data?.success) {
		const items = res.data?.data?.items || [];
		const nextTotal = res.data?.data?.total ?? items.length;
		setAllRows(items);
		setTotal(nextTotal);

		const maxPage = Math.max(1, Math.ceil(nextTotal / pageSize));
		if (activePage > maxPage) {
		  setActivePage(maxPage);
		}
	  } else {
		showError(res.data?.message || t('加载失败'));
	  }
	} catch (e) {
	  showError(t('请求失败'));
	} finally {
	  setLoading(false);
	}
  };

  const refresh = async () => {
	await loadRows();
  };

  const closeEdit = () => {
	setShowEdit(false);
	setEditingRow(null);
  };

  const openCreate = () => {
	setSheetPlacement('left');
	setEditingRow(null);
	setShowEdit(true);
  };

  const openEdit = (row) => {
	const run = async () => {
	  setSheetPlacement('right');
	  if (!row?.id) {
		setEditingRow(row);
		setShowEdit(true);
		return;
	  }
	  try {
		const res = await API.get(`/api/scenario_tutorial/admin/tutorials/${row.id}`);
		if (res?.data?.success) {
		  setEditingRow(res.data?.data);
		} else {
		  setEditingRow(row);
		}
	  } catch (e) {
		setEditingRow(row);
	  } finally {
		setShowEdit(true);
	  }
	};
	run();
  };

  const saveRow = async (payload) => {
	setLoading(true);
	try {
	  let res;
	  if (editingRow?.id) {
		res = await API.put(`/api/scenario_tutorial/admin/tutorials/${editingRow.id}` , payload);
	  } else {
		res = await API.post('/api/scenario_tutorial/admin/tutorials', payload);
	  }
	  if (res.data?.success) {
		showSuccess(t('保存成功'));
		closeEdit();
		await loadRows();
	  } else {
		showError(res.data?.message || t('保存失败'));
	  }
	} catch (e) {
	  showError(t('请求失败'));
	} finally {
	  setLoading(false);
	}
  };

  const setRowStatus = async (record, status) => {
	setLoading(true);
	try {
	  const res = await API.patch(`/api/scenario_tutorial/admin/tutorials/${record.id}/status`, {
		status,
	  });
	  if (res.data?.success) {
		showSuccess(status === 1 ? t('已发布') : t('已设为草稿'));
		await loadRows();
	  } else {
		showError(res.data?.message || t('操作失败'));
	  }
	} catch (e) {
	  showError(t('请求失败'));
	} finally {
	  setLoading(false);
	}
  };

  const removeRow = async (record) => {
	setLoading(true);
	try {
	  const res = await API.delete(`/api/scenario_tutorial/admin/tutorials/${record.id}`);
	  if (res.data?.success) {
		showSuccess(t('删除成功'));
		await loadRows();
	  } else {
		showError(res.data?.message || t('删除失败'));
	  }
	} catch (e) {
	  showError(t('请求失败'));
	} finally {
	  setLoading(false);
	}
  };

  useEffect(() => {
	loadRows();
	// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, pageSize]);

  const rows = useMemo(() => allRows, [allRows]);

  return {
	t,
	rows,
	loading,

	activePage,
	pageSize,
	rowCount: total,
	handlePageChange: setActivePage,
	handlePageSizeChange: (size) => {
	  setPageSize(size);
	  setActivePage(1);
	},

	compactMode,
	setCompactMode,

	showEdit,
	editingRow,
	sheetPlacement,
	closeEdit,
	openCreate,
	openEdit,
	saveRow,
	setRowStatus,
	removeRow,
	refresh,
  };
};
