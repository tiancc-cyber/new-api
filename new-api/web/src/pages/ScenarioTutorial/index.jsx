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

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../helpers';
import { Card, List, Typography, Tag, Skeleton, Empty } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';

const { Title, Paragraph, Text } = Typography;

const ScenarioTutorial = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/scenario_tutorial/public/tutorials', {
        params: { page: 1, page_size: 50 },
      });
      if (res.data?.success) {
        setItems(res.data?.data?.items || []);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listItems = useMemo(() => items, [items]);

  return (
    <div className='mt-[60px] px-2'>
      <Card
        style={{ borderRadius: 8 }}
        title={<Title heading={4}>{t('场景教程')}</Title>}
      >
        <Paragraph type='secondary' style={{ marginTop: 0 }}>
          {t('这里汇总了常用场景的使用教程与最佳实践。')}
        </Paragraph>

        {loading ? (
          <Skeleton placeholder={<Skeleton.Paragraph rows={6} />} loading={true} />
        ) : listItems.length === 0 ? (
          <Empty description={t('暂无教程')} />
        ) : (
          <List
            dataSource={listItems}
            renderItem={(it) => (
              <List.Item
                main={
                  <div className='flex flex-col gap-1'>
                    <div className='flex flex-row flex-wrap gap-2 items-center'>
                      <Link to={`/tutorial/${it.slug}`}>
                        <Text strong style={{ fontSize: 14 }}>
                          {it.title}
                        </Text>
                      </Link>
                      {it.tags ? (
                        <Tag size='small' color='blue'>
                          {it.tags}
                        </Tag>
                      ) : null}
                    </div>
                    {it.intro ? (
                      <Text type='secondary' style={{ fontSize: 12 }}>
                        {it.intro}
                      </Text>
                    ) : null}
                  </div>
                }
              />
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default ScenarioTutorial;

