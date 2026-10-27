const pages = ['workbench','class-mgmt','student-mgmt','schedule','classroom','diagnosis-workspace','classroom-tasks'] as const;
export function assistantSourceRoute(href: string) {
  const url=new URL(href);
  const requested=url.pathname==='/'?url.searchParams.get('page'):null;
  const page=pages.find(page=>page===requested)??'workbench';
  const id=(name:string)=>{const value=url.searchParams.get(name);return value&&/^[a-zA-Z0-9_-]{1,128}$/.test(value)?value:null;};
  return {page,classId:id('classId'),studentId:id('studentId')};
}
