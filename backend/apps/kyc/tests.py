import io
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.kyc.models import KYCDocument, KYCRequest


class KYCTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="kyc@mdg.local", phone="+261340000025", display_name="Joueur KYC"
        )
        self.other_user = User.objects.create_user(
            email="other@mdg.local", phone="+261340000026", display_name="Autre Joueur"
        )
        self.staff_user = User.objects.create_superuser(
            email="staff@mdg.local", phone="+261340000099", display_name="Admin Staff", password="pass"
        )
        self.client = APIClient()

    def test_status_exposes_limits_and_request(self):
        self.client.force_authenticate(self.user)
        res = self.client.get("/api/v1/kyc/status/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["level"], "discovered")
        self.assertTrue(res.data["documents_enabled"])
        self.assertIsNone(res.data["request"])

        # Créer une demande
        first = self.client.post("/api/v1/kyc/status/", {"requested_level": "verified"}, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.data["status"], "pending")

        # Conflit sur deuxième demande concurrente
        second = self.client.post("/api/v1/kyc/status/", {"requested_level": "vip"}, format="json")
        self.assertEqual(second.status_code, 409)

    def test_document_upload_success_and_validation(self):
        self.client.force_authenticate(self.user)
        
        # Fichier PNG valide (1x1 px PNG header minimal)
        valid_png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        file = SimpleUploadedFile("cin_recto.png", valid_png_content, content_type="image/png")

        res = self.client.post(
            "/api/v1/kyc/documents/upload/",
            {"file": file, "document_type": "national_id_front", "requested_level": "verified"},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["document"]["document_type"], "national_id_front")
        self.assertEqual(res.data["document"]["mime_type"], "image/png")
        self.assertEqual(KYCDocument.objects.count(), 1)
        self.assertEqual(KYCRequest.objects.count(), 1)

    def test_invalid_file_rejected(self):
        self.client.force_authenticate(self.user)
        
        # Faux fichier image avec contenu texte
        fake_file = SimpleUploadedFile("malicious.png", b"NOT_A_PNG_FILE_CONTENT", content_type="image/png")
        res = self.client.post(
            "/api/v1/kyc/documents/upload/",
            {"file": fake_file, "document_type": "national_id_front"},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("detail", res.data)

    def test_document_download_security(self):
        self.client.force_authenticate(self.user)
        valid_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        file = SimpleUploadedFile("cin_recto.png", valid_png, content_type="image/png")
        upload_res = self.client.post(
            "/api/v1/kyc/documents/upload/",
            {"file": file, "document_type": "national_id_front"},
            format="multipart",
        )
        doc_id = upload_res.data["document"]["id"]

        # Propriétaire accède avec succès
        own_res = self.client.get(f"/api/v1/kyc/documents/{doc_id}/")
        self.assertEqual(own_res.status_code, 200)

        # Autre utilisateur non staff reçoit 403 Forbidden
        self.client.force_authenticate(self.other_user)
        other_res = self.client.get(f"/api/v1/kyc/documents/{doc_id}/")
        self.assertEqual(other_res.status_code, 403)

        # Staff accède avec succès
        self.client.force_authenticate(self.staff_user)
        staff_res = self.client.get(f"/api/v1/kyc/documents/{doc_id}/")
        self.assertEqual(staff_res.status_code, 200)

    def test_backoffice_kyc_list_and_approval(self):
        # 1. Joueur soumet document et demande
        self.client.force_authenticate(self.user)
        valid_pdf = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        file = SimpleUploadedFile("certificat.pdf", valid_pdf, content_type="application/pdf")
        self.client.post(
            "/api/v1/kyc/documents/upload/",
            {"file": file, "document_type": "proof_of_residence", "requested_level": "verified"},
            format="multipart",
        )
        req = KYCRequest.objects.get(user=self.user)

        # 2. Staff consulte la liste des demandes
        self.client.force_authenticate(self.staff_user)
        list_res = self.client.get("/api/v1/backoffice/kyc/")
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(list_res.data["count"], 1)
        self.assertEqual(list_res.data["results"][0]["user"]["phone"], "+261340000025")

        # 3. Staff approuve la demande
        review_res = self.client.post(
            f"/api/v1/backoffice/kyc/{req.pk}/review/",
            {"action": "approve", "notes": "CIN et certificat valides."},
            format="json",
        )
        self.assertEqual(review_res.status_code, 200)
        
        # 4. Vérifier que l'utilisateur est maintenant "verified"
        self.user.refresh_from_db()
        self.assertEqual(self.user.kyc_level, "verified")
        self.assertIsNotNone(self.user.kyc_verified_at)
        
        req.refresh_from_db()
        self.assertEqual(req.status, "approved")
        self.assertEqual(req.reviewer_id, self.staff_user.pk)
