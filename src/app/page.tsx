import { redirect } from "next/navigation";

/**
 * Le QR Code EcoWatch SCG pointe vers le formulaire public : aucun compte
 * n'est nécessaire pour signaler. L'administration reste sur /admin.
 */
export default function Home() {
  redirect("/signaler");
}