"use client";

import { useEffect, useState } from "react";
import {
  FLOW_CONTROLS_STORAGE_KEY,
  defaultFlowControls,
  parseFlowControls,
  type FlowWheelMode,
} from "../flow-controls";
import { InfoCard, PageHeader } from "../ui";

export default function SettingsPage() {
  const [wheelMode, setWheelMode] = useState<FlowWheelMode>(defaultFlowControls.wheelMode);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setWheelMode(parseFlowControls(window.localStorage.getItem(FLOW_CONTROLS_STORAGE_KEY)).wheelMode);
  }, []);

  function saveSettings() {
    window.localStorage.setItem(FLOW_CONTROLS_STORAGE_KEY, JSON.stringify({ wheelMode }));
    setMessage("Настройки сохранены");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Настройки"
        description="Заготовка раздела для параметров пользователя, ролей и будущего подключения Supabase."
      />
      <InfoCard title="Параметры MVP">
        <dl className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-semibold text-slate-950">Источник данных</dt>
            <dd className="mt-1">Mock-данные, без подключения к Supabase</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-semibold text-slate-950">Ручные заглушки</dt>
            <dd className="mt-1">Отдельная логика со статусами</dd>
          </div>
        </dl>
      </InfoCard>

      <InfoCard title="Управление схемой">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-slate-950">Колесо мыши</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setWheelMode("pan")}
                className={`rounded-md border px-4 py-3 text-left text-sm font-semibold ${
                  wheelMode === "pan"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Движение вверх/вниз
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Обычное колесо двигает схему, масштаб доступен через кнопки и жесты.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setWheelMode("zoom")}
                className={`rounded-md border px-4 py-3 text-left text-sm font-semibold ${
                  wheelMode === "zoom"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Приближение/отдаление
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Обычное колесо меняет масштаб, Ctrl + колесо двигает схему вверх/вниз.
                </span>
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Перемещение схемы зажатой средней кнопкой мыши работает в обоих режимах.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveSettings}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Сохранить настройки
            </button>
            {message ? <span className="text-sm font-semibold text-emerald-700">{message}</span> : null}
          </div>
        </div>
      </InfoCard>
    </div>
  );
}
