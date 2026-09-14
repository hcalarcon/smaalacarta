import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { data, error } = await supabase.from("businesses").select("*");

  console.log(data, error);

  return <div>conexión lista</div>;
}
