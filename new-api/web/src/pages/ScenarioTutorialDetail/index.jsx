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

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { API, showError } from '../../helpers';
import { Card, Typography, Skeleton, Tag, Empty } from '@douyinfe/semi-ui';

const { Title, Paragraph, Text } = Typography;

const ScenarioTutorialDetail = () => {
  const { t } = useTranslation();
  const { slug } = useParams();

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState(null);

  const load = async () => {
	setLoading(true);
	try {
	  const res = await API.get(`/api/scenario_tutorial/public/tutorials/${slug}`);
	  if (res.data?.success) {
		setRow(res.data?.data);
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
  }, [slug]);

  return (
	<div className='mt-[60px] px-2'>
	  <Card style={{ borderRadius: 8 }}>
		{loading ? (
		  <Skeleton placeholder={<Skeleton.Paragraph rows={10} />} loading={true} />
		) : !row ? (
		  <Empty description={t('暂无内容')} />
		) : (
		  <>
			<div className='flex flex-col gap-2'>
			  <Title heading={4} style={{ margin: 0 }}>
				{row.title}
			  </Title>
			  {row.tags ? <Tag color='blue'>{row.tags}</Tag> : null}
			  {row.intro ? (
				<Text type='secondary' style={{ fontSize: 12 }}>
				  {row.intro}
				</Text>
			  ) : null}
			</div>

			<Paragraph style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
			  {row.content}
			</Paragraph>
		  </>
		)}
	  </Card>
	</div>
  );
};

export default ScenarioTutorialDetail;
