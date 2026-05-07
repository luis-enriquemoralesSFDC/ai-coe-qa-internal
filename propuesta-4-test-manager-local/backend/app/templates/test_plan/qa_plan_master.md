<!-- PORTADA — al importar a Google Docs: insertar imágenes en los placeholders [[PORTADA_*]] y aplicar Insert → Break → Page break antes de "# Índice" -->

[[PORTADA_LOGO_CLIENTE: insertar logo del cliente aquí en Google Docs]]

[[PORTADA_IMAGEN: insertar imagen de portada aquí en Google Docs]]

# {{CLIENT_NAME}}

**Plan de Pruebas de Aseguramiento de Calidad**

Versión {{DOC_VERSION}} · {{CONFIDENTIALITY_YEAR}}

SOW: {{SOW_ID}}

---

<!-- FIN DE PORTADA — en Google Docs: Insert → Break → Page break aquí -->

# Índice

1. Objetivo del Documento
2. Historial de versiones del documento
3. Objetivo de Negocio
4. Alcance de las pruebas
   - 4.1 Funcionalidades fuera del alcance (Out of Scope)
5. Principios Básicos de Pruebas
6. Cronograma del Proyecto
   - 6.1 Proceso de Pruebas
7. Estratégia de Ambientes
   - 7.1 Ambientes de Desarrollo de Salesforce
   - 7.2 Frecuencia de despliegues
   - 7.3 Tareas de Prueba
   - 7.4 Creación de Casos de Prueba
   - 7.5 Ejecución del Caso de Prueba
   - 7.6 Objetivo de las pruebas
8. Fases de las Pruebas y Responsabilidades
   - 8.1 Pruebas Unitarias
   - 8.2 Pruebas de Integración de Componentes (CIT)
   - 8.3 Pruebas Funcionales y de Sistema
   - 8.4 Pruebas Regresivas
   - 8.5 Pruebas de Integración de Sistemas (SIT) (Opcional)
   - 8.6 Pruebas de Aceptación de Usuario (UAT)
   - 8.7 Prueba de Humo
   - 8.8 Test de Sanidad
   - 8.9 Prueba de punta a punta
   - 8.10 Pruebas de Seguridad (Opcional)
   - 8.11 Pruebas Mobile (Opcional)
   - 8.12 Pruebas de Integración y API (Opcional)
   - 8.13 Estrategia de Automatización de Pruebas (Opcional)
9. Requisitos de Prueba
   - 9.1 Requisitos de la Historia de Usuario
   - 9.2 Requisitos de bugs/defectos
10. Flujo de la Historia de Usuario
    - 10.1 Ciclo de vida de una Historia de Usuario
    - 10.2 División de la Capacidad de Salesforce
11. Gestión de Defectos
    - 11.1 Flujo de Defectos
    - 11.2 Requisitos para el Registro de Defectos
    - 11.3 Clasificación de Defectos
    - 11.4 Prioridad y Severidad de los Defectos
12. Roles y Responsabilidades
13. Entregables de pruebas
14. Suposiciones
15. Riesgos y Contingencias
    - 15.1 Dependencias
16. Aprobación del Plan de Pruebas

---

# 1. Objetivo del Documento

Este documento sirve como un plan de pruebas de software estándar. El objetivo de este documento es delinear claramente:

- Alcance de la prueba
- Cronograma del proyecto
- Etapas de prueba y propiedad
- Tipos de prueba
- Herramientas/dispositivos de prueba
- Requisitos de prueba
- Gestión de defectos
- Funciones y responsabilidades
- Identificación de riesgos, suposiciones y problemas

# 2. Historial de versiones

| Version | Fecha | Descripción de la modificación | Actualizado Por |
| ----- | ----- | ----- | ----- |
{{VERSION_HISTORY_ROWS}}

# 3. Objetivo de Negocio

{{BUSINESS_GOAL}}

> **Nota:** Para este punto de inicio es fundamental comenzar por el análisis detallado del SOW, donde obtendremos información clave de la negociación con el cliente y los diferentes acuerdos pactados para las entregas.

# 4. Alcance de las pruebas

Salesforce reunirá los requisitos para diseñar y desarrollar la aplicación como parte de la Metodología de Servicios Profesionales de Salesforce. Así, el alcance exacto del proyecto y las pruebas evolucionarán a lo largo de la duración del proyecto.

A medida que se reúnan los requisitos, todos los recursos potenciales aceptados por Salesforce serán ingresados en {{TEST_MANAGEMENT_TOOL}} como historias de usuario. El equipo de QA de Salesforce no probará ninguna historia de usuario, mejora o defecto que no haya sido ingresado en {{TEST_MANAGEMENT_TOOL}}. La combinación de todas las historias de usuario aceptadas y los defectos ingresados en {{TEST_MANAGEMENT_TOOL}} servirá como el alcance total del proyecto.

El equipo de QA de Salesforce realizará pruebas en todos los principales recursos configurados o desarrollados en la plataforma Salesforce por el equipo de desarrollo.

El equipo de Quality Assurance (QA) proporcionará la documentación requerida por {{CLIENT_NAME}} y de acuerdo con lo especificado en el plan de pruebas aprobado. Estas entregas incluyen, pero no se limitan a:

- Plan de Pruebas de Quality Assurance para el proyecto {{CLIENT_NAME}} SOW {{SOW_ID}};
- Pruebas Estáticas (Refinamiento de las historias de usuario y criterios de aceptación);
- Casos de Prueba Manuales (Funcional, Configuración, Regresión y E2E);
  - NOTA: Los scripts de prueba se ingresarán directamente en {{TEST_MANAGEMENT_TOOL}}.
- Informe(s) de Métricas de QA.

## 4.1 Funcionalidades fuera del alcance (Out of Scope)

En la presente sección se detallan las funcionalidades, módulos o escenarios que **no serán objeto de validación** durante este ciclo de ejecución. Dicha exclusión responde a factores como la estabilidad técnica demostrada previamente, la indisponibilidad de dependencias de terceros, escenarios donde las integraciones actuales no sean objetivo de prueba, componentes que no hayan sido desarrollados, pruebas de carga/rendimiento/desempeño/automatizadas/mobile, o decisiones estratégicas del negocio orientadas a optimizar el cronograma de trabajo que no fueron contempladas en el SOW.

{{SCOPE_OUT}}

# 5. Principios Básicos de Pruebas

1. **Pruebas con Scripts** pueden ser utilizadas junto con pruebas exploratorias para ayudar a garantizar un enfoque de prueba más completo.
   1. Las pruebas con Scripts es útil cuando las etapas exactas de la prueba deben ser comunicadas y normalmente se realiza para apoyar las pruebas de regresión, SIT (Pruebas de Integración del Sistema) y UAT (Pruebas de Aceptación del Usuario).
   2. Las validaciones y verificaciones positivas deben realizarse durante la prueba, así como también casos de prueba negativos, además de análisis de límites y pruebas de equivalencia de flujo de trabajo (técnica de caja negra).
2. **Pruebas Exploratorias** son una manera eficiente y eficaz de llevar a cabo las pruebas, especialmente al adoptar metodologías Ágiles y similares a Ágiles, donde la flexibilidad y el desarrollo iterativo son fundamentales.
   1. Esta prueba se realizará por Sprint para validar si el despliegue anterior no afectó las principales funcionalidades y rutas críticas del proceso.
3. **Shift Left Testing** se utiliza como un principio generalizado para ayudar a decidir qué probar, cuándo probar y cómo probar.
   1. En general, las pruebas deben ejecutarse lo antes posible después de la implementación y en el nivel más bajo posible.
   2. Los requisitos pueden ser probados de manera estática durante las revisiones de los casos de prueba antes de que comience el desarrollo del Sprint.

# 6. Cronograma del Proyecto

El cronograma de entrega se llevará a cabo de la siguiente manera:

{{PROJECT_ROADMAP}}

> Sugerencia: aquí va una imagen del cronograma del proyecto (Gantt/timeline) si está disponible. Insertarla manualmente al exportar a Google Docs.

## 6.1 Proceso de Pruebas

### 6.1.1 Fase de Planificación

La fase de Planificación y Arquitectura es la fase inicial de planificación del proyecto, que normalmente ocurre en la fase de Diseño.

Durante esta fase, el equipo de QA:

- Desarrollará el plan general de pruebas;
- Planificará e integrará los recursos iniciales de QA;
- Desarrollará estrategias de prueba específicas.

### 6.1.2 Fase de Análisis

En esta fase, el equipo de QA de Salesforce realizará pruebas estáticas con el objetivo de anticipar cualquier defecto antes de la propia implementación. También es en esta fase donde detallaremos las tareas a realizar.

Para cada historia de usuario, el equipo de QA de Salesforce realizará el Refinamiento, que incluirá:

- Refinamiento de la solución;
- Análisis del valor de negocio;
- Revisión del Criterio de Aceptación.

### 6.1.3 Fase de Modelado

En la fase de modelado, el equipo de QA de Salesforce redactará los casos y escenarios de prueba para cada historia de usuario de acuerdo con la sección "Creación de Casos de Prueba".

### 6.1.4 Fase de Ejecución

La fase de Ejecución es cuando el código y la configuración serán implementados. Un plan de prueba para esta fase es elaborado por el equipo de QA de Salesforce en {{TEST_MANAGEMENT_TOOL}}, como timeboxes (Sprints de {{SPRINT_WEEKS}} semanas) que consisten en historias de usuario preparadas. Durante los sprints, una vez que el desarrollo ha sido completado, el equipo de QA de Salesforce realiza las pruebas de las historias de usuario.

Para cada sprint, QA Salesforce realizará pruebas, incluyendo:

- Pruebas funcionales en las historias de usuario incluidas en el sprint;
- Pruebas de regresión parcial en todos los recursos implementados en el proyecto;
- Retesteo de defectos de cualquier defecto marcado como "Cerrado".

**Nota:** Se recomienda crear un repositorio de conocimiento que incluya videos explicativos de los procesos actuales, de tal forma que sirva como base de conocimiento para los miembros actuales o nuevos del equipo de QA. Esto facilita compartir conocimiento de manera más sencilla.

**Criterios de Suspensión y Reanudación**

Se establecen las condiciones bajo las cuales el proceso de QA debe detenerse para evitar el desperdicio de recursos y asegurar la calidad del reporte final:

- **Criterio de Suspensión:** Las pruebas se suspenderán si se identifica un defecto de severidad "Bloqueante" que impida el avance de más del **20%** de los casos de prueba planificados, o si el entorno de pruebas presenta una inestabilidad técnica persistente.
- **Criterio de Reanudación:** Las actividades se retomarán una vez que el equipo de Desarrollo entregue un *hotfix* verificado o se restablezca la estabilidad del entorno, previa validación del líder de QA.

### 6.1.5 Fase de Conclusión

Al finalizar un sprint, el equipo de QA de Salesforce realizará un análisis de control de la evolución de las pruebas y entregas con el objetivo de presentarlo en la Retrospectiva, creando una acción rápida de mejora para el próximo sprint de desarrollo.

En caso de que el proyecto sea pausado o suspendido por razones ajenas al equipo de QA, se debe recopilar toda la información que se tenga hasta el momento sobre el proceso de pruebas, incluyendo videos explicativos, casos de prueba, evidencias, estado de tareas actuales, y enviarse a los líderes del proyecto. Esto garantiza claridad en la información y facilita un posible regreso a las actividades del proyecto.

# 7. Estratégia de Ambientes

> Sugerencia: aquí va un diagrama de flujo de ambientes (DEV → QA → SIT → UAT → PROD) si está disponible. Insertarlo manualmente al exportar a Google Docs.

## 7.1 Ambientes de Desarrollo de Salesforce

| Entorno | Nombre | Descripción |
| :---- | :---- | :---- |
| Desarrollo | {{ENV_DEV_NAME}} | Usado por los equipos de desarrollo de Salesforce para todas las actividades iniciales de desarrollo y configuración, incluyendo la prueba unitaria. El equipo de QA de Salesforce no realizará pruebas en el entorno de desarrollo. |
| QA | {{ENV_QA_NAME}} | Post-Desarrollo. Usado por el equipo de QA de Salesforce para llevar a cabo pruebas funcionales, de regresión parcial y pruebas de humo. Usado por Salesforce para presentar el trabajo del Sprint completado. |
| SIT | {{ENV_SIT_NAME}} | Fase de Validación. Usado por el equipo de QA de Salesforce para llevar a cabo pruebas de humo antes del inicio de SIT de {{CLIENT_NAME}}. Usado por el equipo de pruebas de {{CLIENT_NAME}} para realizar pruebas de SIT. |
| UAT | {{ENV_UAT_NAME}} | Usado por el equipo de pruebas de {{CLIENT_NAME}} para realizar pruebas de usuario final. |

## 7.2 Frecuencia de despliegues

A continuación se presenta la descripción de los entornos y los responsables de los componentes y la configuración de una etapa a otra en formato tabular.

En general, se observa que:

- Salesforce llevará a cabo sprints de {{SPRINT_WEEKS}} semanas e implementará desde el desarrollo hasta el control de calidad al final de cada sprint;
- El **{{CLIENT_NAME}}** gestionará las implementaciones entre:
  - QA → SIT
  - SIT → UAT
  - UAT → PROD

| Responsable | Ambiente Origen | Ambiente Destino | Frecuencia |
| ----- | ----- | ----- | ----- |
{{DEPLOYMENT_FREQUENCY_ROWS}}

## 7.3 Tareas de Prueba

El/Los analista(s) de control de calidad iniciarán sesión en {{TEST_MANAGEMENT_TOOL}} y revisarán las historias de usuario que han sido asignadas al sprint actual. Para cada historia de usuario, se crearán y rastrearán tareas de control de calidad directamente en la historia del usuario. Las tareas comunes incluirán:

- Análisis de prueba
- Creación de casos de prueba
- Revisión del caso de prueba
- Ejecución de casos de prueba
- Actualización del conjunto de regresión

Después de que se identifiquen las tareas, se proporcionará el tiempo estimado para la finalización de cada tarea. Las estimaciones de las tareas se actualizarán según sea necesario para reflejar el tiempo restante para completar la tarea.

## 7.4 Creación de Casos de Prueba

El/Los analista(s) de QA crearán casos de prueba para cada historia de usuario incluida en un sprint determinado, basándose en los criterios de aceptación previamente definidos. Estos casos de prueba serán alojados en {{TEST_MANAGEMENT_TOOL}} y vinculados a la historia de usuario correspondiente. Cada caso de prueba incluirá las precondiciones necesarias para ejecutar la prueba, el perfil y el inicio de sesión que se deben usar para realizar la prueba, pasos detallados a seguir y los resultados esperados. Las pruebas considerarán escenarios positivos, negativos y de casos extremos.

*Nota:* **{{CLIENT_NAME}} puede revisar los casos de prueba de ser necesario.**

Todos los casos de prueba utilizarán la siguiente convención de nomenclatura:
**[Squad] - [US JIRA ID] - Breve descripción de la prueba**

## 7.5 Ejecución del Caso de Prueba

A medida que cada historia de usuario esté lista para prueba, el/los Analista(s) de QA serán notificados de que la prueba puede comenzar. Después de eso, el/los Analista(s) de QA utilizarán la herramienta {{TEST_MANAGEMENT_TOOL}} para ejecutar el/los script(s) de prueba asociado(s) y verificar el éxito o fracaso del desarrollo.

Con base en los resultados de la prueba, el analista marcará cada caso de prueba como Aprobado o Reprobado según corresponda.

- Si una prueba falla, los analistas de control de calidad de Salesforce crearán un pendiente de errores/defectos y lo asociarán a la historia de usuario en {{TEST_MANAGEMENT_TOOL}}. Consulte la sección Gestión de Errores (Defectos) en este documento.
- Todos los errores/defectos recién creados serán inicialmente asignados al equipo de desarrollo de Salesforce.
- Una vez que el error/defecto sea marcado como "corregido", los analistas de QA realizarán una re-prueba para luego cerrar el error, siempre que la aplicación funcione satisfactoriamente.

Después de la conclusión de la prueba, los analistas de QA actualizarán el estado de prueba de la historia de usuario a Finalizado.
Se registrará un resultado de ejecución de prueba para cada caso de prueba a medida que se ejecute. Una ejecución de prueba incluirá, al menos, la siguiente información:

- ID de la prueba;
- Fecha de ejecución;
- Veredicto de la ejecución de la prueba: No ejecutado, Aprobado, Reprobado, Bloqueado;
- Capturas de pantalla de la ejecución de la prueba;
- Notas/Comentarios (Opcional)
  - Por ejemplo, incluir un ID de errores/defectos si se descubre un error/defecto
  - Notas sobre el entorno de prueba, usuario actualmente conectado.

## 7.6 Objetivo de las pruebas

Los principales objetivos de las pruebas son:

- Verificación de que los requisitos, las especificaciones o las historias son lógicos y no entran en conflicto con la funcionalidad existente en el sistema.
- Verificación de que la funcionalidad entregada cumple con los objetivos comerciales declarados.
- Colaboración con el equipo de entrega de software para promover las mejores prácticas de calidad de software, según sea aplicable.
- Verificación de que los cambios en la aplicación se realizan de acuerdo con las especificaciones, las expectativas del usuario u otros estándares de calidad.
- Usar la combinación adecuada de pruebas y validación para garantizar que la aplicación sea evaluada a un nivel aceptable.
- Trabajar con las partes interesadas y los representantes para asegurar que la UAT (Prueba de Aceptación del Usuario) y las actividades relacionadas se organicen y se lleven a cabo dentro del plazo aceptado.

# 8. Fases de las Pruebas y Responsabilidades

Esta sección describe las etapas que se cubrirán como parte del ciclo de vida de pruebas del proyecto. Los responsables, junto con las etapas, son los siguientes:

## 8.1 Pruebas Unitarias

**Criterio de Entrada:** La implementación del código de la historia de usuario debe estar completada.
**Responsable:** Desarrollador de Salesforce
**Herramienta:** {{TEST_MANAGEMENT_TOOL}}
**Entorno:** Sandbox de desarrollo

**Criterio de Salida:**

- Cobertura de prueba: Se debe alcanzar un nivel predeterminado de cobertura de prueba.
- Casos de prueba ejecutados: Todos los casos de prueba identificados deben ser ejecutados, incluyendo casos de prueba positivos y negativos. Cualquier caso de prueba que falle debe ser investigado y resuelto.
- Resolución de defectos: Cualquier defecto o problema identificado durante la prueba unitaria debe ser resuelto y el código debe ser probado nuevamente para asegurar que las correcciones sean efectivas.
- Documentación: Toda la documentación necesaria relacionada con la prueba unitaria debe ser actualizada, incluyendo casos de prueba, resultados de pruebas y cualquier defecto identificado.

Las pruebas unitarias son los tests más básicos que se pueden escribir. Prueban una única suposición sobre el comportamiento del código recién desarrollado en un sistema. A continuación, se presentan algunos principios orientadores a tener en cuenta para las pruebas unitarias:

- No depende de ninguna otra prueba (clases de prueba Unit Apex).
- No afirma valores creados dinámicamente.
- Contiene solo una simulación.

Es importante tener en cuenta que, cuando las pruebas fallan, no deben ser simplemente modificadas para asegurar que sean aprobadas, sino investigadas para descubrir la causa raíz y, luego, corregidas de manera adecuada. Esto es especialmente relevante cuando se trabaja con pruebas que ya han sido aprobadas. En lo posible se debe solicitar evidencia al equipo de desarrollo sobre la ejecución de las pruebas.

## 8.2 Pruebas de Integración de Componentes (CIT)

**Pruebas de integración de componentes:** Es una prueba que verifica si la interacción entre módulos integrados en un sistema está funcionando.

**Criterio de Entrada:**

- Prueba Unitaria concluida: Los componentes o módulos individuales deben haber sido probados en la Prueba Unitaria y ser considerados listos para la prueba de integración.
- Plan de integración: Debe haberse desarrollado un plan de integración detallado, que incluya el orden de integración, el alcance de la integración y el enfoque de prueba.
- Revisión de código: El código de los componentes debe ser revisado por otros desarrolladores para identificar cualquier defecto o problema que necesite ser resuelto antes de la prueba de integración.
- Resolución de defectos: Cualquier defecto o problema identificado durante la revisión del código o la prueba unitaria debe ser resuelto antes de la prueba de integración.

**Responsable:** Desarrollador SFDC
**Herramienta:** {{TEST_MANAGEMENT_TOOL}}
**Entorno:** Sandbox {{ENV_DEV_NAME}}

**Criterio de Salida:**

- Cobertura de integración: Se debe alcanzar un nivel predeterminado de cobertura de integración. La cobertura de la integración puede medirse por el porcentaje de componentes o módulos que han sido integrados y probados. Una mayor cobertura de integración indica pruebas más exhaustivas del sistema.
- Documentación: Toda la documentación necesaria relacionada con las pruebas de integración debe ser actualizada, incluyendo casos de prueba, resultados de pruebas y cualquier defecto identificado.

## 8.3 Pruebas Funcionales y de Sistema

**Criterio de Entrada:** Los criterios a continuación se aplicarán para la entrada en la fase de pruebas funcionales:

- El BA/BSA actualizó las historias de usuario en {{TEST_MANAGEMENT_TOOL}} con los criterios de aceptación para QA;
- Todas las historias de usuario están identificadas y aprobadas por el {{CLIENT_NAME}} y por Salesforce;
- La prueba unitaria, si es necesario, está concluida.

**Responsable:** Equipo de QA
**Herramienta:** {{TEST_MANAGEMENT_TOOL}}
**Entorno:** Sandbox de QA

**Criterio de Salida:**

- Todas las historias de usuario tienen casos de prueba representativos.
- Todos los casos de prueba han sido ejecutados al menos una vez (100% de cobertura).
- Todos los defectos de alta prioridad pasan por la triagem, son validados y resueltos o se colocan en la lista de pendientes para el próximo sprint.
- Todos los defectos encontrados durante la prueba han sido resueltos, es decir:
  - Todos los defectos P1 y P2 han sido resueltos/cerrados.
  - Todos los defectos P3 y P4 han sido resueltos o cerrados, o bien han sido corregidos o colocados en el backlog para sprints/releases futuros.

## 8.4 Pruebas Regresivas

**Criterio de Entrada:** Los criterios a continuación se aplicarán para la entrada en la fase de prueba de regresión:

- No quedan pruebas de sprint pendientes; todas las pruebas de sprint actuales están concluidas o bloqueadas en este momento.
- Los defectos encontrados durante la prueba funcional han sido gestionados (corregidos/cerrados/pospuestos).
- El análisis de regresión — para identificar los casos de prueba que deben ejecutarse como parte de la regresión — ha sido completado.

**Responsable:** Equipo de QA
**Herramienta:** {{TEST_MANAGEMENT_TOOL}}
**Entorno:** Sandbox de QA

**Criterio de Salida:**

Los criterios a continuación se aplicarán para salir de la fase de prueba de regresión:

- Todos los defectos de prioridad 1 y 2 han sido corregidos, verificados y cerrados.
- Todos los casos de prueba basados en el análisis de regresión han sido ejecutados.
- Todos los defectos encontrados durante la prueba de regresión han sido registrados adecuadamente.

**Nota:** El {{CLIENT_NAME}} es responsable de las pruebas funcionales y/o de regresión de sus sistemas de backend.

## 8.5 Pruebas de Integración de Sistemas (SIT) (Opcional)

**Criterio de Entrada:**

- Revisión de la Historia del Sprint con SC, Dev y QA
- La prueba funcional debe estar completa para iniciar el SIT
- Prueba unitaria de desarrollo evidenciada con un 100% de ejecución
- Cobertura de código de desarrollo evidenciada en un 85%
- Prueba de humo concluida tras la implementación
- La prueba de regresión ha sido completada (si es necesario)

**Responsable:** QA {{CLIENT_NAME}}
**Herramienta:** {{TEST_MANAGEMENT_TOOL}}
**Ambiente:** SIT sandbox ({{ENV_SIT_NAME}})

**Criterio de Salida:**

- Plan de pruebas SIT actualizado/revisado y preparación para el próximo Sprint
- Casos de prueba 100% ejecutados
- Defectos resueltos (ningún defecto Alto o Crítico está abierto).

## 8.6 Pruebas de Aceptación de Usuario (UAT)

**Criterio de Entrada:**

- Prueba del sistema aprobada, prueba de regresión aprobada, cambios de código completados
- La prueba SIT está completa, sin defectos altos o críticos (problemas abiertos triados y acordados)
- Limpieza de datos en el entorno SF UAT después de E2E (comenzar desde cero)
- Paquete de pruebas UAT creado y actualizado en el entorno

**Responsable:** {{CLIENT_NAME}} PO/Partes interesadas
**Herramienta:** Prueba Manual
**Ambiente:** UAT sandbox ({{ENV_UAT_NAME}})

**Criterio de Salida:** Prueba aprobada; cualquier defecto conocido aceptado.

> Sugerencia: aquí va un diagrama del flujo UAT (estados, responsables, transiciones) si está disponible.

### Preparativos para la fase UAT

- Cada unidad de negocio de {{CLIENT_NAME}} identificará al equipo de pruebas UAT
- Los scripts de prueba UAT serán creados antes del inicio de UAT, según sea necesario
- Los tests deben ser socializados de manera anticipada con el equipo de QA Salesforce, con el fin de identificar posibles brechas o diferencias con relación al producto esperado por parte del equipo del cliente.
- {{CLIENT_NAME}} mapeará las rutas críticas del proceso que se deben probar
- NOTA: Los responsables del producto actuarán como líderes de prueba UAT

### Ejecución de las Pruebas UAT

- El equipo de {{CLIENT_NAME}} UAT comenzará a ejecutar los scripts de prueba UAT
- La ejecución de la prueba UAT incluirá una combinación de ejecución de scripts de prueba UAT y/o pruebas ad hoc

### Informar problemas al líder de pruebas UAT

- Si se descubre algún defecto, el equipo de pruebas UAT reportará esos defectos al líder de pruebas UAT.
- El líder de pruebas UAT analizará la lista de problemas y registrará los defectos válidos en {{TEST_MANAGEMENT_TOOL}}.
  - NOTA: Los defectos son registros con Tipo de Registro = Bug
- Los defectos ingresados se registrarán de la misma manera especificada anteriormente. Consulte la sección "Requisitos de entrada de defectos".
- Todos los defectos del UAT deben ser prefijados con "UAT –".

### Clasificación de Defectos UAT

- Los equipos del Product Owner y de Salesforce realizarán la clasificación de los defectos del UAT. La clasificación incluirá la validación de:
  - Resultados esperados
  - Prioridad del defecto
  - "Completitud", es decir, que incluya toda la información requerida por el probador.
  - Dentro del alcance del proyecto
- Cualquier defecto que sea una solicitud de cambio, mejora o limitación del sistema puede ser marcado como pospuesto y colocado en el backlog.
- Si el defecto no se considera un problema, será Cerrado (o Rechazado).
  - Al cerrar o rechazar, se proporcionará una explicación sobre el motivo del cierre.
  - El líder del equipo UAT notificará al probador original de que el problema no ha sido aceptado.

### El equipo de Salesforce corrige los defectos

- Los defectos válidos siguen el proceso normal de gestión de defectos según lo indicado anteriormente.
- Una vez que el defecto se haya corregido, el equipo de control de calidad de Salesforce lo volverá a probar.
- Después de que el equipo de control de calidad de Salesforce verifique la corrección, el estado del defecto se actualizará a "Liberación pendiente" para indicar que está listo para ser probado nuevamente.

### Reprueba y cierre del Defecto

- El equipo UAT realizará una nueva prueba para verificar si el defecto ha sido corregido.
- Los defectos corregidos se cierran en {{TEST_MANAGEMENT_TOOL}}.
- Los defectos que no pasan la nueva prueba se reabren.
  - Los defectos reabiertos se ingresan nuevamente en el proceso de clasificación del UAT.
  - Los defectos reabiertos deben contener nueva información sobre el motivo por el cual la corrección del defecto no fue aceptada.

## 8.7 Prueba de Humo

El Smoke Test es un pequeño conjunto de pruebas básicas. Se ejecuta después de una implementación en cualquier entorno de pruebas, antes de que comiencen las pruebas funcionales o de regresión. Su objetivo es confirmar que la nueva compilación no ha roto fundamentalmente el software y evitar que el equipo de control de calidad pierda tiempo probando una aplicación que no funciona correctamente.

Los conjuntos de smoke tests deben ser breves, tomando menos de 30 minutos para completarse. Funcionalidades complejas o flujos de trabajo largos no deben incluirse en las pruebas de smoke.

**Criterio de Entrada:** Despliegue en el entorno de QA, SIT y/o UAT
**Responsable:** QA Salesforce
**Herramienta:** Prueba Manual y {{TEST_MANAGEMENT_TOOL}}
**Ambiente:** Sandboxes SIT/QA y UAT

**Criterio de Salida:** Pruebas Smoke exitosas o fallas aceptadas.

## 8.8 Test de Sanidad

El Sanity Testing (Prueba de Sanidad) es un conjunto de pruebas rápidas y enfocadas, realizado después de un ciclo de corrección de defectos o retesteo, para garantizar que las correcciones no introdujeron problemas graves en funcionalidades específicas y que el área afectada del sistema está funcionando según lo esperado, evitando la redundancia con el Smoke Testing. Valida la estabilidad de un área particular antes de proceder con pruebas más detalladas.

**Criterio de Entrada:** Finalización del Sprint y Despliegue ejecutado en (SIT y/o UAT)

**Responsable:** QA Salesforce
**Herramienta:** Prueba Manual
**Ambiente:** QA Sandbox

**Criterio de Salida:**

- Verificación de la estabilidad básica: las funciones críticas del software siguen operativas después de realizar cambios o actualizaciones.
- Detección de errores graves: defectos fundamentales que puedan afectar la usabilidad o funcionalidad general del software.
- Confirmación de la viabilidad de la versión actual: Certificación de que la versión actual del software es lo suficientemente estable como para someterse a pruebas más extensas y detalladas, como pruebas de regresión o pruebas de integración más completas.

## 8.9 Prueba de punta a punta

**Criterio de Entrada:** Integraciones de sistema concluidas. Casos de prueba de extremo a extremo diseñados y aprobados por el cliente.
**Responsable:** QA Salesforce
**Herramienta:** Prueba Manual
**Ambiente:** QA/SIT sandbox
**Criterio de Aceptación:**

- Todos los tests E2E completados
- No hay defectos altos/críticos
- Resultados de prueba y reporte de cierre de prueba firmados por el cliente

## 8.10 Pruebas de Seguridad (Opcional)

El **Test de Seguridad End to End** es un tipo de prueba que evalúa el sistema contra amenazas a los datos o a la integridad del sistema. Todos los componentes y aplicaciones desarrollados deben estar configurados e implementados correctamente, y las integraciones con sitios externos deben estar protegidas como están actualmente. La plataforma Salesforce se audita y prueba anualmente, por lo que una seguridad totalmente exhaustiva puede no ser necesaria. Es importante tener en cuenta que las pruebas de penetración también pueden resultar en el cierre del entorno Salesforce o en la lista bloqueada, a menos que se coordinen adecuadamente. Los recursos de seguridad integrados en las plataformas Apex y Salesforce también protegen contra patrones y actividades sospechosas; estos pueden ser probados durante las pruebas de aceptación y el monitoreo de seguridad.

**Criterios de salida:** No se han encontrado defectos de seguridad críticos o graves.

## 8.11 Pruebas Mobile (Opcional)

**Prueba Móvil (Mobile) - Opcional.** Las Pruebas Móviles tienen el objetivo de validar la funcionalidad, usabilidad, rendimiento y compatibilidad de las aplicaciones en dispositivos móviles, garantizando que cumplan con los requisitos técnicos y proporcionen una experiencia de usuario de alta calidad. Estas pruebas verifican el comportamiento de la aplicación en diferentes dispositivos (celulares y tabletas), sistemas operativos, versiones y resoluciones de pantalla, además de identificar posibles problemas de rendimiento o inconsistencias específicas del entorno móvil. La validación puede realizarse tanto en dispositivos reales como en emuladores/simuladores, dependiendo del escenario y la necesidad del proyecto; asimismo, los modelos y especificaciones técnicas de las versiones y dispositivos que se probarán deben definirse en la SOW del proyecto.

**Mejores prácticas de QA: Prueba Móvil y Emuladores**

- **Criterio de Entrada:** Versión estable de la aplicación, requisitos documentados, dispositivos y/o emuladores para iOS y Android.
- **Responsable:** QA Salesforce
- **Herramienta:** Prueba Manual
- **Entorno:** Dispositivos móviles reales o emuladores/simuladores
- **Ambiente:** QA Sandbox, SIT, UAT
- **Criterio de Salida:**
  - **Compatibilidad:** Certificar que la aplicación funcione correctamente en los diferentes dispositivos, sistemas operativos, versiones y tamaños de pantalla, conforme a lo definido previamente.
  - **Verificación de usabilidad:** Garantizar que la aplicación proporcione una experiencia de usuario fluida, intuitiva y consistente.
  - **Prueba de funcionalidad:** Validar que todas las funcionalidades y características de la aplicación operen según lo esperado, incluyendo interacciones específicas del entorno móvil, como toques y gestos.

## 8.12 Pruebas de Integración y API (Opcional)

Las Pruebas de Integración y API tienen como objetivo validar la interacción entre los diferentes módulos del sistema y garantizar el correcto funcionamiento de las APIs que los conectan. Estas pruebas aseguran el intercambio preciso de datos, la comunicación eficiente entre los componentes y el cumplimiento de los requisitos técnicos. Además, se utilizan para identificar fallos de integración, inconsistencias o problemas de rendimiento, garantizando que el sistema en su conjunto opere de forma estable y confiable.

**Mejores prácticas de QA:** Pruebas de API

**Criterio de Entrada:**

- Conclusión del desarrollo de los módulos
- Documentación detallada de las APIs que contenga endpoints, métodos soportados, parámetros, cuerpo de la solicitud y respuesta esperada
- Configuración del entorno de pruebas integrado
- Revisión de código completada de acuerdo con los estándares establecidos

**Responsable:** Desarrollador SFDC

**Ejecución de las Pruebas:** las pruebas de API validan diversos aspectos de los endpoints, incluyendo:

- Pruebas de autenticación:
  - Verifica si el token de acceso se obtiene correctamente, con la validez esperada
  - Valida la respuesta para accesos no autorizados
- Pruebas de CRUD (Crear, Leer, Actualizar y Eliminar):
  - Creación de un nuevo registro mediante API (comando: POST)
  - Consulta de registros existentes (comando: GET)
  - Actualización de información de un registro (comandos: PATCH o PUT)
  - Eliminación de registros con validación de la respuesta (comando: DELETE)
- Validación de Status Code y Response Body:
  - Comprobación del estado de cada solicitud según lo esperado (200, 201, 400, 401, 403, 404 etc.)
  - Verificación de la estructura del JSON de respuesta y de los valores devueltos

**Responsable:** QA Salesforce

**Herramienta:** Prueba Manual

**Ambiente:** Sandbox de QA, SIT y/o Ambiente de Integración

**Criterio de Salida:**

- Confirmación de que los componentes integrados y las APIs funcionan según lo esperado, sin causar impactos negativos en otros módulos
- Se debe alcanzar un nivel predeterminado de cobertura de pruebas de API, garantizando que se hayan validado los flujos principales
- La documentación relacionada con las pruebas de API debe estar actualizada, incluyendo casos de prueba, resultados de las pruebas y cualquier defecto identificado

**Herramienta de Gestión de Pruebas:** {{TEST_MANAGEMENT_TOOL}}

## 8.13 Estrategia de Automatización de Pruebas (Opcional)

**Nota:** La automatización de pruebas se llevará a cabo únicamente si está contemplada dentro del alcance (**SOW**) del proyecto. En caso de ser necesario, consulte el enlace a la documentación completa de automatización para este proyecto específico a continuación.

### 8.13.1 Criterios de Entrada (Entry Criteria)

Para iniciar las actividades de automatización, se deben cumplir los siguientes requisitos:

- **Madurez de Casos de Prueba:** Los casos deben estar identificados, diseñados y revisados. Los pasos de ejecución deben estar claramente definidos.
- **Entorno de Pruebas:** El ambiente debe estar configurado (hardware, software y red) específicamente para la ejecución automatizada.
- **Datos de Prueba:** Preparación de datos positivos y negativos para validar la funcionalidad de punta a punta.
- **Herramientas y Frameworks:** Identificación y configuración del framework de automatización y lenguajes de scripting aprobados.
- **Priorización:** Los casos de prueba se priorizarán según su criticidad e importancia para el negocio. Este trabajo debe hacerse en conjunto con el equipo de Arquitectura.
- **Capacitación del Equipo:** El equipo de QA debe poseer el conocimiento técnico necesario sobre las herramientas y frameworks seleccionados.
- **Resolución de Defectos Previos:** Los defectos críticos identificados en pruebas manuales deben estar resueltos para evitar bloqueos en los scripts.

### 8.13.2 Detalles de Ejecución

- **Responsable (Owner):** Equipo de QA de Salesforce.
- **Herramientas:** Se utilizarán exclusivamente herramientas internas de Salesforce.
- **Entornos:** QA y UAT.

### 8.13.3 Criterios de Salida (Exit Criteria)

La fase de automatización se considerará finalizada cuando:

- **Ejecución Completa:** Se hayan ejecutado todos los casos de prueba identificados (positivos y negativos). Los fallos deben ser investigados y resueltos.
- **Cobertura de Pruebas:** Se debe alcanzar el nivel de cobertura predefinido (porcentaje de casos ejecutados y funcionalidad cubierta).
- **Resolución de Defectos:** Todos los defectos hallados durante la automatización deben estar resueltos y verificados.
- **Comunicación de Resultados:** Los resultados deben estar documentados, revisados y comunicados a los stakeholders relevantes.

### 8.13.4 Tipos de Automatización (Sujeto a SOW)

Dependiendo del alcance del proyecto, se implementarán los siguientes tipos de pruebas:

- **Automatización de API:** Validación de endpoints entre sistemas externos y Salesforce Sandbox utilizando BDD con REST Assured. Herramientas recomendadas: Eclipse, Visual Studio Code y SOAPui.
- **Automatización de UI:** Pruebas de interfaz de usuario utilizando la herramienta interna de Salesforce.

## Herramienta de Gestión de Defectos

{{DEFECT_MANAGEMENT_TOOL}}

## Navegadores

{{BROWSERS}}

# 9. Requisitos de Prueba

El equipo de QA de Salesforce solo probará historias de usuarios y defectos que cumplan con los siguientes criterios:

## 9.1 Requisitos de la Historia de Usuario

- Todas las actividades de prueba deben tener historias de usuario vinculadas en {{TEST_MANAGEMENT_TOOL}}.
- Cada historia de usuario priorizada debe contener criterios de aceptación sobre los cuales se crearán las pruebas:
  - Las historias de usuario sin criterios de aceptación deben ser actualizadas antes de que comiencen las actividades de QA.
  - Si es necesario, una historia de usuario debe incluir archivos adjuntos y/o enlaces a documentación de soporte relacionada.
- Los puntos de la historia de usuario deben tener en cuenta el esfuerzo necesario para que la historia sea probada por el equipo de QA de Salesforce.
- Salesforce comenzará a probar la historia de usuario SOLAMENTE después de que la historia de usuario esté marcada como "Esperando Pruebas de QA".

## 9.2 Requisitos de bugs/defectos

- El equipo de QA de Salesforce aceptará y volverá a probar los bugs/defectos que no fueron creados por el equipo de QA de Salesforce, incluyendo aquellos creados por:
  - Desarrolladores de Salesforce;
  - Product Owner(s) de {{CLIENT_NAME}};
  - Equipo(s) UAT de {{CLIENT_NAME}}.
- Todos los bugs/defectos que requieran una nueva prueba por parte del QA de Salesforce DEBEN ser ingresados en {{TEST_MANAGEMENT_TOOL}}.
- Bugs/defectos que requieran una nueva prueba por parte del QA de Salesforce deben contener al menos la siguiente información:
  - Criterios de reproducción;
  - Entorno de prueba;
  - Usuario actualmente conectado;
  - Registros específicos, si los hay;
  - Pasos para reproducir los bugs/defectos, incluyendo cualquier precondición;
  - Resultados esperados;
  - Resultados actuales (problema);
  - Caso de prueba vinculado o historia(s) de usuario;
  - Cualquier captura de pantalla asociada.
- NOTA: Al ingresar bugs/defectos, el equipo de control de calidad de Salesforce seguirá las directrices detalladas en la sección "Requisitos entrada de bugs/defectos" de este documento.
- El equipo de calidad de Salesforce comenzará a volver a probar los bugs/defectos SOLAMENTE después de que los bugs/defectos estén marcados como "Esperando Pruebas de QA".

# 10. Flujo de la Historia de Usuario

El ciclo de flujo de trabajo de la historia de usuario resulta ser muy significativo en el monitoreo del estado del desarrollo, la calidad y la velocidad con la que avanza el producto. Estos ciclos de vida aumentan la transparencia, permitiendo visibilidad sobre las actividades del equipo.

| Estado | Definición | Acción |
| ----- | ----- | ----- |
| Abierto | En el Backlog - A la espera de Refinamiento | - Priorizar la sesión de refinamiento del backlog |
| Listo para Desarrollo | Cumple con los criterios de aceptación y listo para Desarrollo | - Asignar a un sprint |
| En Desarrollo | Asignado a un Desarrollador y en progreso | - Informar en la sesión del Daily<br>- Añadir el tiempo real gastado<br>- Añadir comentario de estado<br>- Crear branch y confirmar |
| Listo para Despliegue | Revisión de código por el líder de desarrollo o un compañero | - Crear solicitud de pull y asignar un revisor<br>- Añadir comentario de feedback |
| Listo para Probar | Despliegue realizado para QA | - Desplegar al ambiente de QA |
| En QA | En Pruebas por el equipo de QA de Salesforce |  |
| Listo para Demostración | El equipo QA de Salesforce dictamina que está correcto |  |
| Cerrado | Demostración del Sprint aprobada | - Asignar la etiqueta de lanzamiento R1 y añadir al branch de lanzamiento |
| Bloqueado | El desarrollador no puede avanzar | - Añadir comentario<br>- Programar reunión con SA/TA |

> Sugerencia: aquí va un diagrama del flujo de historia de usuario (estados, transiciones, responsables) si está disponible.

## 10.1 Ciclo de vida de una Historia de Usuario

{{USER_STORY_LIFECYCLE}}

## 10.2 División de la Capacidad de Salesforce

{{SALESFORCE_CAPACITY}}

> Sugerencia: aquí va una imagen de la división de capacidad por sprint si está disponible.

# 11. Gestión de Defectos

Para garantizar que los problemas identificados puedan ser resueltos de manera eficiente y eficaz, es esencial que los defectos, problemas o cuestiones se reporten de manera que puedan ser evaluados y resueltos adecuadamente. Al reportar defectos, deben estar presentes los siguientes componentes y detalles:

## 11.1 Flujo de Defectos

Los defectos reportados en {{TEST_MANAGEMENT_TOOL}} deberán utilizar los siguientes estados:

| Estado | Descripción | Asignado a |
| ----- | ----- | ----- |
| Nuevo | Un nuevo defecto es reportado y será analizado para garantizar si es un defecto válido. | Ninguno |
| Asignado | El defecto es válido y necesita comenzar a ser resuelto, por lo tanto, se asigna al equipo responsable. | Líder de Desarrollo/Desarrollador |
| Abierto | El desarrollador ha comenzado a trabajar en la corrección del defecto. | Desarrollador |
| Corregido | El defecto ha sido corregido y está listo para ser probado nuevamente. | Líder de Desarrollo/Desarrollador |
| Esperando | Este es el estado asignado al defecto después de su corrección y antes de que QA comience la nueva prueba. | Líder de QA |
| Re Probar | QA ha comenzado la nueva prueba del defecto. | QA |
| Re Abrir | QA ha vuelto a probar el defecto y sigue con el error. | Líder de Desarrollo/Desarrollador |
| Pospuesto | Es un defecto válido, pero no ha sido priorizado para corrección. Puede ser añadido al backlog y corregido cuando sea necesario. | BA |
| Rechazado | El defecto no es válido. | QA |
| Duplicado | Ya existe un defecto similar reportado. | QA |
| Verificado | El defecto ha sido probado nuevamente y todos los problemas han sido corregidos. | QA |
| Cerrado | Cuando el defecto ya no existe, el probador cambia el estado a "Cerrado". | QA |

## 11.2 Requisitos para el Registro de Defectos

Para agilizar la resolución de defectos, estos deben ser reportados con toda la información necesaria para resolverlos. Los defectos registrados por el equipo de QA de Salesforce contendrán los siguientes criterios:

- Nombre del defecto, debe ser breve y descriptivo del problema
- Pasos para reproducir
- Resultados reales (es decir, del problema)
- Resultados esperados
- Capturas de pantalla del defecto
- Prioridad
- Severidad
- Entorno en el que se encontró (nombre del entorno, por ejemplo, TI01, TI02, etc.)
- Datos de prueba
- Historia de usuario vinculada
- Otra información, según corresponda, por ejemplo:
  - URLs para registros específicos en el entorno donde se encontró el defecto;
  - Imágenes de prototipos;
  - Hojas de cálculo de campos;
  - Otros anexos relacionados con los elementos referenciados.

Los defectos generalmente siguen la convención de nomenclatura a continuación:

- **[Squad] [JIRAID-US] - Título del Incidente** (Que permita comprender sobre qué trata el bug)

## 11.3 Clasificación de Defectos

### Defectos reportados por el equipo de QA de Salesforce

- Los defectos reportados por el equipo de QA de Salesforce serán registrados en {{TEST_MANAGEMENT_TOOL}} y asignados a los desarrolladores, quienes procederán con las correcciones.

### Defectos reportados por {{CLIENT_NAME}}

- Los defectos ingresados por el equipo de {{CLIENT_NAME}} deben seguir las mismas directrices listadas en la sección Requisitos para el Registro de Defectos.
- El equipo de arquitectura y el equipo de QA revisarán los defectos para confirmar si son válidos y asignarles su prioridad y severidad. El análisis de los defectos puede realizarse a través de reuniones de clasificación de defectos o durante las reuniones diarias, según sea necesario.
- Los defectos válidos serán comunicados al equipo, añadidos al backlog del producto y priorizados.
- Defectos identificados durante la fase de pruebas de UAT y cómo pueden ser tratados:
- Defectos identificados durante la fase de pruebas de UAT:
  - Todos los defectos del UAT de {{CLIENT_NAME}} ingresados en {{TEST_MANAGEMENT_TOOL}} pasarán por una revisión conjunta realizada entre el equipo de Salesforce y {{CLIENT_NAME}}.
- Los defectos encontrados por el equipo de {{CLIENT_NAME}} deben seguir la convención de nomenclatura a continuación:
  - Defectos encontrados en la fase de SIT:
    - **SIT - [Squad] [JIRAID-US] - Título del Incidente** (Que permita comprender sobre qué trata el bug)
  - Defectos encontrados en la fase de UAT:
    - **UAT - [Squad] [JIRAID-US] - Título del Incidente** (Que permita comprender sobre qué trata el bug)

**Importante:** Los defectos no necesitan ser reportados únicamente por el equipo de QA. CUALQUIER miembro del equipo puede, y se le anima a, reportar defectos conocidos. El equipo de QA volverá a probar TODOS los defectos, a menos que se le instruya específicamente que no realice la nueva prueba de algún defecto.

## 11.4 Prioridad y Severidad de los Defectos

Todos los defectos encontrados por Salesforce o {{CLIENT_NAME}} serán reportados en {{TEST_MANAGEMENT_TOOL}} y tendrán una prioridad y severidad asignadas por la persona que reportó el defecto. A continuación se presentan las directrices para la clasificación de defectos.

NOTA: el PO puede aumentar o disminuir la Prioridad o Severidad de un defecto determinado, si es necesario.

### Definiciones de Severidad

La severidad es el grado de impacto que un defecto tiene sobre la operación de una aplicación o sistema, generalmente definido por la persona que lo reporta. A continuación se presentan las directrices para la clasificación de defectos.

- **Severidad 1 - Crítica:** detiene completamente el funcionamiento.
- **Severidad 2 - Alta:** falla en una funcionalidad principal.
- **Severidad 3 - Media:** falla en una funcionalidad menor.
- **Severidad 4 - Baja:** afecta aspectos cosméticos o de usabilidad.

### Definiciones de Prioridad

Todos los defectos reportados serán registrados en {{TEST_MANAGEMENT_TOOL}} y serán categorizados según su prioridad. A continuación se presentan las directrices para la clasificación de defectos:

| Categoría | Descripción | Acción |
| ----- | ----- | ----- |
| P1 - Crítica | Defectos que deben ser corregidos de inmediato. Son defectos que causan fallos en la aplicación o impiden completamente la capacidad del usuario para utilizar el sistema.<br>- Bloquea pruebas adicionales.<br>- El usuario no puede acceder al sistema. | Debe ser resuelto antes de pasar a UAT/Go-Live. Triage en menos de 2 horas y Resolución en menos de 24 horas. |
| P2 - Alta | Defectos que hacen que una funcionalidad crítica no funcione correctamente, pero que no impiden que el usuario acceda al sistema. Problemas críticos con una solución alternativa difícil o inexistente.<br>- El área crítica del sistema se ve afectada.<br>- Será altamente visible y/o perjudicial si se libera.<br>- No cumple con los requisitos especificados para la versión. | Debe ser resuelto antes del lanzamiento. Puede pasar a UAT/Go-Live según la decisión del PO. Triage en menos de 4 horas y Resolución en menos de 48 horas. |
| P3 - Media | Defectos que no impiden la capacidad del usuario para acceder a las funcionalidades principales o que tienen soluciones alternativas razonables.<br>- Debe ser corregido según el tiempo disponible; se ve afectada un área no crítica del sistema.<br>- Algunos usuarios se ven afectados, pero hay una solución alternativa razonable. | Esto dependerá de la priorización de los defectos según la decisión del PO. Triage en menos de 8 horas y Resolución dentro del sprint actual o el próximo. |
| P4 - Baja | Generalmente son defectos de diseño o cosméticos.<br>- Error de tipeo, error gramatical o terminología incorrecta utilizada.<br>- Pocos usuarios notarían o se verían afectados por él. | Esto dependerá de la priorización de los defectos según la decisión del PO. Triage en menos de 24 horas y Resolución a discreción del Product Owner (añadido al Backlog). |

# 12. Roles y Responsabilidades

A continuación, describimos los roles identificados en el proyecto y sus responsabilidades respecto a las pruebas a ser ejecutadas:

| Rol | Responsabilidades |
| :---- | :---- |
| Project Manager | Soporte al equipo de QA con aprobaciones |
| QA Lead/Analyst | - Crear el plan de pruebas.<br>- Definir los procesos generales de control de calidad.<br>- Participar en reuniones de stand-up/iteración.<br>- Liderar reuniones de triage de defectos de QA.<br>- Asistir en reuniones de triage de defectos de UAT.<br>- Crear casos de prueba.<br>- Ejecutar casos de prueba.<br>- Construir informes y verificar defectos.<br>- Análisis y priorización de defectos.<br>- Realizar análisis y pruebas de regresión.<br>- Comunicar el estado de las pruebas. |
| Business Analyst(s) | - Proporcionar orientación del negocio.<br>- Definir los requisitos del entorno de prueba.<br>- Tratar (corregir/delegar/posponer) defectos.<br>- Brindar soporte al equipo de QA.<br>- Ofrecer soporte al PO. |
| Technical Architect, Development Team | - Resolver (corregir/delegar/posponer) defectos.<br>- Brindar soporte al equipo de QA.<br>- Brindar soporte al PO |
| **{{CLIENT_NAME}}** Product Owner (PO) | - Gestionar el alcance.<br>- Identificar solicitudes de mejora.<br>- Priorizar defectos.<br>- Aprobar UAT. |
| **{{CLIENT_NAME}}** Project Manager (PM) | - Analizar todos los defectos enviados durante la reunión de revisión de defectos y confirmar la prioridad inicial del defecto.<br>- Coordinar las pruebas de UAT con los usuarios finales. |
| **{{CLIENT_NAME}}** UAT Test Lead | - Coordinar y gestionar las pruebas de UAT. |
| UAT Testers | - Probar los épicos que fueron entregados para pruebas.<br>- Identificar los defectos que no cumplen con los criterios de aceptación. |

# 13. Entregables de pruebas

A continuación se mencionan todos los artefactos de prueba que se entregarán durante las diferentes fases del ciclo de prueba.

| Item | Antes de la fase de testing | Durante la fase de testing | Después de la fase de testing |
| :---- | :---- | :---- | :---- |
| 1 | Plan de pruebas | Casos de pruebas | Resultado de las pruebas y métricas |
| 2 | Especificaciones del diseño de pruebas | Configuración de datos necesaria para la prueba | Documentos de liberación |
| 3 | Registros de ejecución de pruebas | Registros de defectos y registros de rendimiento | Firma del cliente |

# 14. Suposiciones

| ID | Premissa |
| :---- | :---- |
| A1 | Ambientes de pruebas: Los ambientes de prueba están listos antes del inicio de cada ciclo de iteración. Los usuarios de prueba están configurados adecuadamente para las pruebas necesarias. Los datos de prueba estarán disponibles en los ambientes de prueba antes de la prueba. Los datos de prueba adicionales pueden ser creados manualmente, si es necesario, para completar la prueba. Ninguna prueba será realizada por el equipo de QA de Salesforce en el entorno de producción. |
| A2 | Pruebas unitarias: Las pruebas unitarias serán realizadas por el equipo de desarrollo de Salesforce y el equipo de QA de Salesforce no llevará a cabo ninguna prueba unitaria. |
| A3 | Pruebas de Carga y Desempeño: El equipo de QA de Salesforce no ejecutará pruebas de rendimiento. |
| A4 | Pruebas fuera del alcance: El equipo de {{CLIENT_NAME}} será responsable de diseñar y ejecutar casos de negocio que estén fuera del alcance de las pruebas; el equipo de {{CLIENT_NAME}} será responsable de probar las integraciones, con cierto grado de colaboración con el equipo de QA Salesforce, según sea necesario. |
| A5 | Casos de prueba de Salesforce: Todos los casos de prueba serán creados suponiendo que el tester tenga un conocimiento básico y familiaridad con Salesforce y su ruta de navegación común. Los casos de prueba se mantendrán según sea necesario durante el proyecto, pero el equipo de QA Salesforce no creará pruebas para UAT; el equipo de QA Salesforce brindará apoyo para que el {{CLIENT_NAME}} pueda crear sus propios casos de prueba. OBSERVACIÓN: los casos de prueba del equipo de Salesforce pueden usarse como base para los casos de UAT, pero estos deben escribirse por separado, basados en los procesos diarios del usuario. |
{{EXTRA_ASSUMPTIONS_ROWS}}

# 15. Riesgos y Contingencias

Los riesgos y contingencias mencionados a continuación se han identificado específicamente como aquellos que afectarán las pruebas, en caso de que ocurran. Tras la aprobación de este documento, el Líder de QA o el gerente de proyecto deberá transferirlos al registro de riesgos del proyecto.

| ID | Descripción | Probabilidad | Impacto | Mitigar |
| :---- | :---- | :---- | :---- | :---- |
| 1 | Atraso en la entrega | Medio | Alto | Monitoreo y control continuos de las pruebas por parte del Líder de QA/PM |
| 2 | Ambigüedad en los requisitos | Alto | Alto | Participación del equipo de QA en sesiones de refinamiento |
| 3 | Cambios frecuentes en los requisitos o alteración de las historias de usuarios/criterios de aceptación después del inicio del sprint | Bajo | Alto | Aprobación del {{CLIENT_NAME}} en las historias antes del desarrollo. El proceso debe ser simplificado para evitar estos problemas. |
| 4 | Falta de recursos | Bajo | Medio | Aumentar recursos adicionales durante picos de carga de trabajo |
| 5 | Historias entregadas al equipo de QA para pruebas al final del Sprint | Alto | Alto | Las historias deben ser implementadas en QA durante el Sprint con un plazo máximo discutido. |
{{EXTRA_RISKS_ROWS}}

## 15.1 Dependencias

Lista todas las dependencias identificadas durante el desarrollo de este plan de prueba que puedan afectar su ejecución exitosa (en caso de que tales dependencias no sean respetadas). Normalmente, estas dependencias están relacionadas con actividades que son prerrequisitos o post requisitos para una o más actividades anteriores (o posteriores). Es necesario considerar las responsabilidades que dependen de otros equipos o miembros del equipo externos al equipo de pruebas, la finalización, el tiempo y las dependencias de otras tareas planificadas, además de la dependencia de determinados productos de trabajo que se están produciendo.

| Dependencia | Posible Impacto de la Dependencia | Responsables |
| ----- | ----- | ----- |
| Disponibilidad de sistemas externos integrados para pruebas SIT/E2E. |  |  |
| Finalización de la preparación de datos por el equipo de cliente para UAT. |  |  |
| Disponibilidad de ambientes de prueba a tiempo. |  |  |
{{EXTRA_DEPENDENCIES_ROWS}}

# 16. Aprobación del Plan de Pruebas

| Nombre | Compañia | Rol | Fecha de Aprobación |
| :---- | :---- | :---- | :---- |
{{APPROVALS_ROWS}}

- El equipo de {{CLIENT_NAME}} y el equipo de Salesforce han revisado y aprobado todas las actividades descritas arriba.
- El resumen de los cambios de la revisión debe ser rastreado en la tabla "Historial de versiones del documento" (mostrada al inicio de este documento).

---

*Notice of Confidentiality © {{CONFIDENTIALITY_YEAR}} salesforce.com All rights reserved.*
*THIS DOCUMENT IS SALESFORCE.COM PROPRIETARY AND CONFIDENTIAL INFORMATION AND IS SUBJECT TO THE TERMS OF THE SALESFORCE.COM, INC. NON-DISCLOSURE AGREEMENT. NEITHER THIS DOCUMENT NOR ITS CONTENTS MAY BE REVEALED, RECREATED, COPIED OR DISCLOSED TO UNAUTHORIZED PERSONS OR SENT OUTSIDE THE AFOREMENTIONED INSTITUTION WITHOUT PRIOR PERMISSION FROM SALESFORCE.COM.*
