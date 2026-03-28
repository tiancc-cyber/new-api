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

import React from 'react';
import CardPro from '../../common/ui/CardPro';
import BlogManagesTable from './BlogManagesTable';
import BlogManagesActions from './BlogManagesActions';
import AddEditBlogManageModal from './modals/AddEditBlogManageModal';
import { useBlogManagesData } from '../../../hooks/blog_manages/useBlogManagesData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';

const BlogManagesPage = () => {
  const blogData = useBlogManagesData();
  const isMobile = useIsMobile();

  const {
    showEdit,
    editingBlog,
    sheetPlacement,
    closeEdit,
    refresh,
    openCreate,
    compactMode,
    setCompactMode,
    t,
  } = blogData;

  return (
    <>
      <AddEditBlogManageModal
        visible={showEdit}
        handleClose={closeEdit}
        editingBlog={editingBlog}
        placement={sheetPlacement}
        refresh={refresh}
        onSubmit={blogData.saveBlog}
        t={t}
      />

      <CardPro
        type='type1'
        descriptionArea={
          <div className='flex flex-col gap-1'>
            <div className='text-base font-medium'>{t('博客管理')}</div>
            <div className='text-xs text-[var(--semi-color-text-2)]'>
              {t('管理后台博客文章。')}
            </div>
          </div>
        }
        actionsArea={
          <BlogManagesActions
            openCreate={openCreate}
            compactMode={compactMode}
            setCompactMode={setCompactMode}
            t={t}
          />
        }
        paginationArea={createCardProPagination({
          currentPage: blogData.activePage,
          pageSize: blogData.pageSize,
          total: blogData.blogCount,
          onPageChange: blogData.handlePageChange,
          onPageSizeChange: blogData.handlePageSizeChange,
          isMobile,
          t,
        })}
        t={t}
      >
        <BlogManagesTable {...blogData} />
      </CardPro>
    </>
  );
};

export default BlogManagesPage;

