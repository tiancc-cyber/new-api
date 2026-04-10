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
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';

import ScenarioTutorialsTable from './ScenarioTutorialsTable';
import ScenarioTutorialsActions from './ScenarioTutorialsActions';
import AddEditScenarioTutorialModal from './modals/AddEditScenarioTutorialModal';
import { useScenarioTutorialsData } from '../../../hooks/scenario_tutorials/useScenarioTutorialsData';

const ScenarioTutorialManagesPage = () => {
  const data = useScenarioTutorialsData();
  const isMobile = useIsMobile();

  const {
    showEdit,
    editingRow,
    sheetPlacement,
    closeEdit,
    refresh,
    openCreate,
    compactMode,
    setCompactMode,
    t,
  } = data;

  return (
    <>
      <AddEditScenarioTutorialModal
        visible={showEdit}
        handleClose={closeEdit}
        editingRow={editingRow}
        placement={sheetPlacement}
        refresh={refresh}
        onSubmit={data.saveRow}
        t={t}
      />

      <CardPro
        type='type1'
        descriptionArea={
          <div className='flex flex-col gap-1'>
            <div className='text-base font-medium'>{t('场景教程管理')}</div>
            <div className='text-xs text-[var(--semi-color-text-2)]'>
              {t('管理后台场景教程内容。')}
            </div>
          </div>
        }
        actionsArea={
          <ScenarioTutorialsActions
            openCreate={openCreate}
            compactMode={compactMode}
            setCompactMode={setCompactMode}
            t={t}
          />
        }
        paginationArea={createCardProPagination({
          currentPage: data.activePage,
          pageSize: data.pageSize,
          total: data.rowCount,
          onPageChange: data.handlePageChange,
          onPageSizeChange: data.handlePageSizeChange,
          isMobile,
          t,
        })}
        t={t}
      >
        <ScenarioTutorialsTable {...data} />
      </CardPro>
    </>
  );
};

export default ScenarioTutorialManagesPage;
