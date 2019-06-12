/*
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/
'use strict';

export function getItemFromEvent(event) {
  const target = getElementTarget(event);
  const row = target && target.closest('.row');
  return row && row.parentNode;
}

export function getElementTarget(event) {
  let target = event.target;
  if (!(target instanceof Element))
    target = target.parentNode;
  return target;
}

export function getRelatedItemFromEvent(event) {
  let target = event.relatedTarget;
  if (!target)
    return null;
  if (!(target instanceof Element))
    target = target.parentNode;
  const row = target && target.closest('.row');
  return row && row.parentNode;
}
