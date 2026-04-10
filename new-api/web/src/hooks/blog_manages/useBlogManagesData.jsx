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

export const useBlogManagesData = () => {
  const { t } = useTranslation();

  const [compactMode, setCompactMode] = useTableCompactMode('blog_manages');

  const [allBlogs, setAllBlogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [showEdit, setShowEdit] = useState(false);
  const [editingBlog, setEditingBlog] = useState(null);
  const [sheetPlacement, setSheetPlacement] = useState('left');

  const loadBlogs = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/blog_manage/admin/blogs', {
        params: {
          page: activePage,
          page_size: pageSize,
        },
      });
      if (res.data?.success) {
        const items = res.data?.data?.items || [];
        const nextTotal = res.data?.data?.total ?? items.length;
        setAllBlogs(items);
        setTotal(nextTotal);

        // keep page in range
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
    await loadBlogs();
  };

  const closeEdit = () => {
    setShowEdit(false);
    setEditingBlog(null);
  };

  const openCreate = () => {
    setSheetPlacement('left');
    setEditingBlog(null);
    setShowEdit(true);
  };

  const openEdit = (blog) => {
    const run = async () => {
      setSheetPlacement('right');
      if (!blog?.id) {
        setEditingBlog(blog);
        setShowEdit(true);
        return;
      }
      try {
        const res = await API.get(`/api/blog_manage/admin/blogs/${blog.id}`);
        if (res?.data?.success) {
          setEditingBlog(res.data?.data);
        } else {
          setEditingBlog(blog);
        }
      } catch (e) {
        setEditingBlog(blog);
      } finally {
        setShowEdit(true);
      }
    };
    run();
  };

  const saveBlog = async (payload) => {
    setLoading(true);
    try {
      let res;
      if (editingBlog?.id) {
        res = await API.put(
          `/api/blog_manage/admin/blogs/${editingBlog.id}`,
          payload,
        );
      } else {
        res = await API.post('/api/blog_manage/admin/blogs', payload);
      }
      if (res.data?.success) {
        showSuccess(t('保存成功'));
        closeEdit();
        await loadBlogs();
      } else {
        showError(res.data?.message || t('保存失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  const setBlogStatus = async (record, status) => {
    setLoading(true);
    try {
      const res = await API.patch(
        `/api/blog_manage/admin/blogs/${record.id}/status`,
        {
          status,
        },
      );
      if (res.data?.success) {
        showSuccess(status === 1 ? t('已发布') : t('已设为草稿'));
        await loadBlogs();
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  const removeBlog = async (record) => {
    setLoading(true);
    try {
      const res = await API.delete(`/api/blog_manage/admin/blogs/${record.id}`);
      if (res.data?.success) {
        showSuccess(t('删除成功'));
        await loadBlogs();
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
    loadBlogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, pageSize]);

  const blogs = useMemo(() => allBlogs, [allBlogs]);

  return {
    t,
    blogs,
    loading,

    activePage,
    pageSize,
    blogCount: total,
    handlePageChange: setActivePage,
    handlePageSizeChange: (size) => {
      setPageSize(size);
      setActivePage(1);
    },

    compactMode,
    setCompactMode,

    showEdit,
    editingBlog,
    sheetPlacement,
    closeEdit,
    openCreate,
    openEdit,
    saveBlog,
    setBlogStatus,
    removeBlog,
    refresh,
  };
};
