# Структура данных MVP

Основные таблицы:

parts — детали
routes — маршруты
operations — операции
machines — станки
machine_cells — ячейки станков
holders — оснастка / оправки
tools — инструменты
tool_assemblies — инструментальные сборки
operation_resources — ресурсы операции
manual_placeholders — ручные заглушки

Главное правило:
операция может ссылаться на запись из справочника или хранить ручную заглушку.

Пример:
operation_resources.machine_id — выбранный станок из справочника
operation_resources.machine_manual_text — ручной текст, если станка нет в базе
operation_resources.machine_source — catalog / manual / required