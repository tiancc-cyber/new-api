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

import React, { useEffect, useRef, useState, useContext } from 'react';
import { Modal, Button, Typography, Toast, Spin } from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { API } from '../../../helpers';
import QRCode from 'qrcode';

import { UserContext } from '../../../context/User';

const { Text } = Typography;

const QR_VALID_SECONDS = 60;

export default function WeChatPayModal({
	visible,
	onCancel,
	codeUrl,
	tradeNo,
	onRefresh,
	t,
}) {
	const [, userDispatch] = useContext(UserContext);
	const [leftSeconds, setLeftSeconds] = useState(QR_VALID_SECONDS);
	const [expired, setExpired] = useState(false);
	const [queryLoading, setQueryLoading] = useState(false);
	const [cancelLoading, setCancelLoading] = useState(false);
	const [refreshLoading, setRefreshLoading] = useState(false);
	const [qrLoading, setQrLoading] = useState(false);
	const [closingLoading, setClosingLoading] = useState(false);
	const [qrSvgDataUrl, setQrSvgDataUrl] = useState('');
	const timerRef = useRef(null);
	const qrCanvasRef = useRef(null);
	const mountedRef = useRef(false);
	const visibleRef = useRef(false);
	const opSeqRef = useRef(0);
	const confirmOpenRef = useRef(false);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		visibleRef.current = !!visible;
		// When modal becomes invisible, clear transient flags to avoid stale blocking state.
		if (!visible) {
			confirmOpenRef.current = false;
			if (mountedRef.current) {
				setClosingLoading(false);
			}
		}
	}, [visible]);

	useEffect(() => {
		setQrSvgDataUrl('');
		if (!visible) return;
		if (!codeUrl || typeof codeUrl !== 'string') {
			// eslint-disable-next-line no-console
			console.warn('WeChatPayModal: empty/invalid codeUrl', codeUrl);
			return;
		}
		let canceled = false;
		setQrLoading(true);
		const render = () => {
			const canvas = qrCanvasRef.current;
			if (!canvas) {
				// eslint-disable-next-line no-console
				console.warn('WeChatPayModal: canvas not ready (defer)');
				if (!canceled) {
					requestAnimationFrame(render);
				}
				return;
			}
			// Clear canvas to avoid showing stale content.
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.clearRect(0, 0, canvas.width, canvas.height);
			}
			// eslint-disable-next-line no-console
			console.debug('WeChatPayModal: render QR, codeUrl length=', codeUrl.length);
			QRCode.toCanvas(
				canvas,
				codeUrl,
				{
					width: 220,
					margin: 1,
					errorCorrectionLevel: 'M',
				},
				async (err) => {
					if (canceled) return;
					if (!err) {
						setQrLoading(false);
						return;
					}
					// eslint-disable-next-line no-console
					console.error('WeChatPayModal: canvas QR render failed, fallback to SVG', err);
					try {
						const svg = await QRCode.toString(codeUrl, {
							type: 'svg',
							margin: 1,
							errorCorrectionLevel: 'M',
						});
						const encoded = encodeURIComponent(svg)
							.replace(/'/g, '%27')
							.replace(/"/g, '%22');
						setQrSvgDataUrl(`data:image/svg+xml;charset=utf-8,${encoded}`);
					} catch (e) {
						Toast.error({ content: t('二维码生成失败') });
					} finally {
						setQrLoading(false);
					}
				},
			);
		};
		requestAnimationFrame(render);
		return () => {
			canceled = true;
		};
	}, [visible, codeUrl, t]);

	const resetCountdown = () => {
		setLeftSeconds(QR_VALID_SECONDS);
		setExpired(false);
	};

	useEffect(() => {
		if (!visible) return;
		resetCountdown();
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		timerRef.current = setInterval(() => {
			setLeftSeconds((s) => {
				const next = s - 1;
				if (next <= 0) {
					clearInterval(timerRef.current);
					timerRef.current = null;
					setExpired(true);
					return 0;
				}
				return next;
			});
		}, 1000);
		return () => {
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [visible, tradeNo]);

	const handleRefresh = async () => {
		if (!onRefresh) return;
		setRefreshLoading(true);
		try {
			await onRefresh();
			resetCountdown();
		} finally {
			setRefreshLoading(false);
		}
	};

	const handleQueryPaid = async () => {
		if (!tradeNo) return;
		const mySeq = ++opSeqRef.current;
		setQueryLoading(true);
		try {
			const res = await API.post('/api/user/wechatpay/query', {
				trade_no: tradeNo,
			});
			const { success, message, data } = res.data;
			if (!success) {
				Toast.error({ content: message || t('查询失败') });
				return;
			}
			if (data?.paid && data?.credited) {
				// Refresh current balance immediately after crediting.
				try {
					const selfRes = await API.get('/api/user/self');
					if (selfRes.data?.success) {
						userDispatch?.({ type: 'login', payload: selfRes.data.data });
					}
				} catch (e) {
					// Best-effort: balance refresh failure should not block success flow.
				}
				Toast.success({ content: t('支付成功，已入账') });
				onCancel?.();
				return;
			}

			if (data?.paid && !data?.credited) {
				Toast.warning({ content: t('已支付但入账失败，请稍后重试') });
				return;
			}
			Toast.info({ content: t('暂未查询到支付成功，请稍后重试') });
		} catch (e) {
			Toast.error({ content: t('查询失败') });
		} finally {
			// Prevent setState after unmount / or when a newer operation already started.
			if (mountedRef.current && opSeqRef.current === mySeq && visibleRef.current) {
				setQueryLoading(false);
			}
		}
	};

	const handleCancelPay = async () => {
		if (!tradeNo) {
			onCancel?.();
			return;
		}
		const mySeq = ++opSeqRef.current;
		setCancelLoading(true);
		try {
			const res = await API.post('/api/user/wechatpay/cancel', {
				trade_no: tradeNo,
			});
			const { success, message } = res.data;
			if (!success) {
				Toast.error({ content: message || t('取消失败') });
				return;
			}
			Toast.success({ content: t('已取消') });
			onCancel?.();
		} catch (e) {
			Toast.error({ content: t('取消失败') });
		} finally {
			if (mountedRef.current && opSeqRef.current === mySeq && visibleRef.current) {
				setCancelLoading(false);
			}
		}
	};

	const refreshSelfBalanceBestEffort = async () => {
		try {
			const selfRes = await API.get('/api/user/self');
			if (selfRes.data?.success) {
				userDispatch?.({ type: 'login', payload: selfRes.data.data });
			}
		} catch (e) {
			// ignore
		}
	};

	const handleClose = async () => {
		// Close from the Modal (top-right X / mask / ESC)
		// Requirement: close should query status first; paid => success; unpaid => confirm then cancel.
		if (closingLoading || queryLoading || cancelLoading) return;
		if (!tradeNo) {
			onCancel?.();
			return;
		}
		const mySeq = ++opSeqRef.current;
		setClosingLoading(true);
		try {
			let paid = false;
			let credited = false;
			let queryOk = false;
			try {
				const res = await API.post('/api/user/wechatpay/query', { trade_no: tradeNo });
				const { success, message, data } = res.data;
				if (!success) {
					Toast.error({ content: message || t('查询失败') });
				} else {
					queryOk = true;
					paid = !!data?.paid;
					credited = !!data?.credited;
				}
			} catch (e) {
				Toast.error({ content: t('查询失败') });
			}

			if (paid && credited) {
				await refreshSelfBalanceBestEffort();
				Toast.success({ content: t('支付成功，已入账') });
				onCancel?.();
				return;
			}

			if (paid && !credited) {
				Toast.warning({ content: t('已支付但入账失败，请稍后重试') });
				return;
			}

			// If query fails, still allow user to close by confirming (avoid trapping user in modal).
			if (confirmOpenRef.current) return;
			confirmOpenRef.current = true;
			Modal.confirm({
				title: t('尚未支付，是否关闭？'),
				content: queryOk
					? t('关闭后将视为取消支付，若你已在微信完成支付请先点击「我已支付」确认。')
					: t('当前无法确认支付状态。若直接关闭将视为取消支付，建议稍后重试查询或点击「我已支付」。'),
				okText: t('确认关闭'),
				cancelText: t('继续支付'),
				onOk: () => {
					// Returning the promise makes confirm wait for completion.
					return handleCancelPay();
				},
				onCancel: () => {
					confirmOpenRef.current = false;
				},
				afterClose: () => {
					confirmOpenRef.current = false;
				},
			});
		} finally {
			// Do not unlock closing state if a newer operation already started or modal is gone.
			if (mountedRef.current && opSeqRef.current === mySeq && visibleRef.current) {
				setClosingLoading(false);
			}
		}
	};

	return (
		<Modal
			title={t('微信支付')}
			visible={visible}
			onCancel={handleClose}
			footer={null}
			maskClosable={true}
			centered
			width={420}
		>
			<div style={{ textAlign: 'center', padding: 8 }}>
				<div style={{ position: 'relative', display: 'inline-block' }}>
					<div
						style={{
							width: 220,
							height: 220,
							borderRadius: 8,
							overflow: 'hidden',
							background: '#fff',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						{(!codeUrl || qrLoading) && <Spin />}
						{!codeUrl && !qrLoading && (
							<Text type='danger' style={{ fontSize: 12, padding: 8 }}>
								{t('二维码链接为空，请刷新重试')}
							</Text>
						)}
						{!!qrSvgDataUrl && !qrLoading && (
							<img
								src={qrSvgDataUrl}
								alt={t('微信支付二维码')}
								style={{ width: 220, height: 220, display: 'block' }}
								onError={() => {
									Toast.error({ content: t('二维码图片加载失败') });
								}}
							/>
						)}
						<canvas
							ref={qrCanvasRef}
							width={220}
							height={220}
							style={{
								width: 220,
								height: 220,
								display: codeUrl && !qrLoading && !qrSvgDataUrl ? 'block' : 'none',
							}}
							aria-label={t('微信支付二维码')}
						/>
					</div>

					{expired && (
						<div
							style={{
								position: 'absolute',
								left: 0,
								top: 0,
								right: 0,
								bottom: 0,
								background: 'rgba(255,255,255,0.92)',
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								justifyContent: 'center',
								gap: 12,
								borderRadius: 8,
							}}
						>
							<Text>{t('二维码已过期')}</Text>
							<Button
								icon={<IconRefresh />}
								loading={refreshLoading}
								onClick={handleRefresh}
							>
								{t('刷新二维码')}
							</Button>
						</div>
					)}
				</div>

				<div style={{ marginTop: 12 }}>
					<Text>
						{t('请使用微信扫描二维码完成支付')}（{t('剩余')} {leftSeconds}s）
					</Text>
				</div>
				<div style={{ marginTop: 6 }}>
					<Text type='tertiary' style={{ fontSize: 12 }}>
						{t('订单号')}: {tradeNo || '-'}
					</Text>
				</div>

				{/*<div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>*/}
				{/*	<Button*/}
				{/*		type='primary'*/}
				{/*		disabled={expired}*/}
				{/*		onClick={() => {*/}
				{/*			if (!codeUrl) return;*/}
				{/*			window.open(codeUrl, '_blank');*/}
				{/*		}}*/}
				{/*	>*/}
				{/*		{t('在微信中打开')}*/}
				{/*	</Button>*/}
				{/*	<Button*/}
				{/*		disabled={!codeUrl}*/}
				{/*		onClick={() => {*/}
				{/*			if (!codeUrl) return;*/}
				{/*			copy(codeUrl);*/}
				{/*			Toast.success({ content: t('支付链接已复制到剪贴板') });*/}
				{/*		}}*/}
				{/*	>*/}
				{/*		{t('复制支付链接')}*/}
				{/*	</Button>*/}
				{/*</div>*/}

				<div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
					<Button
						loading={queryLoading}
						disabled={expired || !tradeNo}
						onClick={handleQueryPaid}
					>
						{t('我已支付')}
					</Button>
					<Button
						type='tertiary'
						loading={cancelLoading}
						onClick={handleCancelPay}
					>
						{t('取消支付')}
					</Button>
				</div>
			</div>
		</Modal>
	);
}

