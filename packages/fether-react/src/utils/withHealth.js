// Copyright 2015-2018 Parity Technologies (UK) Ltd.
// This file is part of Parity.
//
// SPDX-License-Identifier: BSD-3-Clause

import BigNumber from 'bignumber.js';
import { combineLatest, interval, Observable, fromEvent, merge } from 'rxjs';
import { compose, mapPropsStream } from 'recompose';
import {
  audit,
  distinctUntilChanged,
  filter,
  map,
  publishReplay,
  startWith,
  switchMap,
  take
} from 'rxjs/operators';
import isElectron from 'is-electron';
import isEqual from 'lodash/isEqual';
import { peerCount$, syncStatus$, withoutLoading } from '@parity/light.js';

import parityStore from '../stores/parityStore';

const electron = isElectron() ? window.require('electron') : null;

const isApiConnected$ = parityStore.isApiConnected$;

const isParityRunning$ = Observable.create(observer => {
  if (electron) {
    electron.ipcRenderer.on('parity-running', (_, isParityRunning) => {
      observer.next(isParityRunning);
    });
  }
}).pipe(
  startWith(electron ? !!electron.remote.getGlobal('isParityRunning') : false)
);

const downloadProgress$ = Observable.create(observer => {
  if (electron) {
    electron.ipcRenderer.on('parity-download-progress', (_, progress) => {
      observer.next(progress);
    });
  }
}).pipe(startWith(0));

const isClockSync$ = Observable.create(observer => {
  if (electron) {
    electron.ipcRenderer.send('asynchronous-message', 'check-clock-sync');
    electron.ipcRenderer.once('check-clock-sync-reply', (_, clockSync) => {
      observer.next(clockSync.isClockSync);
    });
  }
}).pipe(startWith(true));

const online$ = merge(
  fromEvent(window, 'online').pipe(map(() => true)),
  fromEvent(window, 'offline').pipe(map(() => false))
).pipe(startWith(navigator.onLine));

const combined$ = combineLatest(
  isParityRunning$,
  isApiConnected$,
  downloadProgress$,
  online$,
  isClockSync$
).pipe(publishReplay(1));
combined$.connect();

// Subscribe to the RPCs only once we set a provider
const rpcs$ = isApiConnected$.pipe(
  filter(isApiConnected => isApiConnected),
  take(1),
  switchMap(() =>
    combineLatest(
      syncStatus$()
        .pipe(
          map(syncStatus => {
            if (!syncStatus) {
              return {
                isSync: true
              };
            }

            const { currentBlock, highestBlock, startingBlock } = syncStatus;
            const syncPercentage = currentBlock
              .minus(startingBlock)
              .multipliedBy(100)
              .div(highestBlock.minus(startingBlock));

            return {
              isSync: false,
              syncPayload: {
                currentBlock,
                highestBlock,
                syncPercentage,
                startingBlock
              }
            };
          })
          // Emit "not synced" only if we haven't been synced for over 2 seconds
        )
        .pipe(audit(syncStatus => interval(syncStatus.isSync ? 0 : 2000))),
      peerCount$().pipe(withoutLoading())
    )
  ),
  startWith([{ isSync: false }, undefined]), // Don't stall the HOC's combineLatest; emit immediately
  publishReplay(1)
);
rpcs$.connect();

// Inject node health information as health.{status, payload} props
export default compose(
  mapPropsStream(props$ =>
    combineLatest(props$, combined$, rpcs$).pipe(
      map(
        ([
          props,
          [
            isParityRunning,
            isApiConnected,
            downloadProgress,
            online,
            isClockSync
          ],
          [{ isSync, syncPayload }, peerCount]
        ]) => {
          const isDownloading =
            online && downloadProgress > 0 && !isParityRunning;
          const isNodeConnected =
            !isDownloading && isApiConnected && isParityRunning;
          const isNoPeers = peerCount === undefined || peerCount.lte(1);
          const isGood =
            isSync && !isNoPeers && isClockSync && isNodeConnected && online;

          // Status - list of all states of health store
          let status = {
            internet: online, // Internet connection
            nodeConnected: isNodeConnected, // Connected to local Parity Ethereum node
            clockSync: isClockSync, // Local clock is not synchronised
            downloading: isDownloading, // Currently downloading Parity Ethereum
            launching: !isApiConnected, // Launching Parity Ethereum only upon startup
            peers: !isNoPeers, // Connecion to peer nodes
            syncing: !isSync, // Synchronising blocks
            good: isGood // Synchronised and no issues
          };

          // Payload - optional payload of a state
          let payload = {
            downloading: {
              syncPercentage: new BigNumber(Math.round(downloadProgress * 100))
            },
            syncing: syncPayload
          };

          return {
            ...props,
            health: {
              status,
              payload
            }
          };
        }
      ),
      distinctUntilChanged(isEqual) // Perform deep comparison
    )
  )
);
