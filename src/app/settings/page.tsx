import { InfoCard, PageHeader } from "../ui";

export default function SettingsPage() {
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
    </div>
  );
}
